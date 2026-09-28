import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';

import { InboxList } from '@/components/conversations/inbox-list';
import { InboxViews } from '@/components/conversations/inbox-views';
import { ConversationView } from '@/components/conversations/conversation-view';
import { toast } from '@/components/toast';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useSession } from '@/contexts/SessionContext';
import {
  type AdvisorChat,
  type AdvisorChatPage,
  type AdvisorMessage,
  fetchInbox,
  fetchMessages,
  type InboxView,
  fetchUsers,
  useCaseLabelOf,
  viewUrl,
  mergeMessages,
  POLL_MS,
  releaseConversation,
  replyToConversation,
  takeConversation,
  toBubble,
} from '@/lib/advisor';
import { matchesQuery } from '@/lib/conversations';
import { cn } from '@/lib/utils';

// Messages of the open conversation: full list on open, then only the new
// ones every POLL_MS.
function useConversationMessages(chatId: string | null) {
  const [messages, setMessages] = useState<AdvisorMessage[]>([]);
  const lastIdRef = useRef<string | undefined>(undefined);

  const apply = useCallback((incoming: AdvisorMessage[], full: boolean) => {
    setMessages((current) => {
      const next = full ? incoming : mergeMessages(current, incoming);
      lastIdRef.current = next.at(-1)?.id;
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!chatId) return;
    try {
      const { messages: incoming, full } = await fetchMessages(
        chatId,
        lastIdRef.current,
      );
      apply(incoming, full);
    } catch {
      // The next poll retries.
    }
  }, [chatId, apply]);

  useEffect(() => {
    setMessages([]);
    lastIdRef.current = undefined;
    if (!chatId) return;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [chatId, refresh]);

  return { messages, append: (m: AdvisorMessage) => apply([m], false), refresh };
}

const VIEW_TITLE = { inbox: 'Bandeja', waiting: 'Sin atender', mine: 'Mías', resolved: 'Resueltas' };

function viewTitle(view: InboxView): string {
  return view.kind === 'useCase' ? useCaseLabelOf(view.useCase) : VIEW_TITLE[view.kind];
}

export default function ConversationsPage() {
  const { session, role } = useSession();
  const me = session?.user?.email;
  // The admin supervises (read-only, everything); the advisor attends.
  const readOnly = role === 'admin';
  const [view, setView] = useState<InboxView>({ kind: 'inbox' });
  const [userId, setUserId] = useState<string | null>(null);
  const { data: users } = useSWR(readOnly ? '/api/advisor/users' : null, fetchUsers, {
    revalidateOnFocus: false,
  });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AdvisorChat | null>(null);
  const [busy, setBusy] = useState(false);
  // Same persisted open/closed state as the Agente section's sidebar.
  const isCollapsed = localStorage.getItem('sidebar:state') === 'false';

  const { data: pages, size, setSize, mutate } = useSWRInfinite<AdvisorChatPage>(
    (index, previous: AdvisorChatPage | null) => {
      if (previous && !previous.hasMore) return null;
      return viewUrl(view, {
        userId,
        startingAfter: index > 0 ? previous?.chats.at(-1)?.id : undefined,
      });
    },
    fetchInbox,
    { refreshInterval: POLL_MS, revalidateOnFocus: false },
  );

  const chats = useMemo(
    () =>
      (pages ?? [])
        .flatMap((page) => page.chats)
        .filter((chat) => matchesQuery(query, chat.userEmail, chat.title)),
    [pages, query],
  );
  const hasMore = pages?.at(-1)?.hasMore ?? false;

  // Keep the open conversation in sync with each inbox refresh; it stays open
  // even when it no longer matches the current filter.
  const fresh = chats.find((chat) => chat.id === selected?.id);
  const current = fresh ?? selected;

  const { messages, append, refresh } = useConversationMessages(current?.id ?? null);
  const bubbles = useMemo(() => messages.map((m) => toBubble(m, me)), [messages, me]);

  async function act(run: () => Promise<void>) {
    setBusy(true);
    try {
      await run();
    } catch {
      toast({ type: 'error', description: 'No se pudo completar la acción.' });
    } finally {
      setBusy(false);
      mutate();
    }
  }

  function handleTake() {
    if (!current) return;
    act(async () => {
      const result = await takeConversation(current.id);
      if (result.ok) {
        setSelected(result.chat);
        refresh();
      } else {
        toast({
          type: 'error',
          description: `Ya la atiende ${result.assignedTo ?? 'otra persona'}.`,
        });
      }
    });
  }

  function handleRelease(outcome: 'returned_to_agent' | 'resolved') {
    if (!current) return;
    act(async () => {
      const result = await releaseConversation(current.id, outcome);
      if (result.ok) {
        setSelected(result.chat);
        refresh();
      } else {
        toast({ type: 'error', description: 'Esta conversación ya no es tuya.' });
      }
    });
  }

  async function handleSend(text: string): Promise<boolean> {
    if (!current) return false;
    try {
      const result = await replyToConversation(current.id, text);
      if (result.ok) {
        append(result.message);
        return true;
      }
      toast({ type: 'error', description: 'Otra persona tomó esta conversación.' });
      mutate();
      return false;
    } catch {
      toast({ type: 'error', description: 'No se pudo enviar el mensaje.' });
      return false;
    }
  }

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <InboxViews
        view={view}
        onViewChange={(next) => {
          setView(next);
          setSelected(null);
        }}
        isAdmin={readOnly}
        users={users ?? []}
        userId={userId}
        onUserChange={setUserId}
      />
      <SidebarInset className="h-dvh min-h-0 overflow-hidden md:h-[calc(100dvh-1rem)]">
        <div className="flex h-full min-h-0">
          <div
            className={cn(
              'h-full min-w-0',
              current ? 'w-[520px] shrink-0 border-border border-r' : 'flex-1',
            )}
          >
            <InboxList
              title={viewTitle(view)}
              chats={chats}
              grouped={view.kind === 'inbox'}
              me={me}
              selectedId={current?.id ?? null}
              onOpen={(id) => setSelected(chats.find((chat) => chat.id === id) ?? null)}
              query={query}
              onQueryChange={setQuery}
              compact={!!current}
              hasMore={hasMore}
              onLoadMore={() => setSize(size + 1)}
            />
          </div>
          {current && (
            <div className="h-full min-w-0 flex-1">
              <ConversationView
                chat={current}
                bubbles={bubbles}
                me={me}
                readOnly={readOnly}
                busy={busy}
                onTake={handleTake}
                onRelease={handleRelease}
                onSend={handleSend}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
