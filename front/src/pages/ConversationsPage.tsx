import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';

import { InboxList } from '@/components/conversations/inbox-list';
import { InboxViews } from '@/components/conversations/inbox-views';
import { ConversationView } from '@/components/conversations/conversation-view';
import { CustomerContextPanel } from '@/components/conversations/customer-context-panel';
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
  countsUrl,
  fetchCounts,
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
import { ASSISTANT_NAME } from '@/lib/assistant';
import { matchesQuery, STATUS_LABEL } from '@/lib/conversations';
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

const CONTEXT_KEY = 'console:context-open';

function readContextOpen(): boolean {
  try {
    return localStorage.getItem(CONTEXT_KEY) !== 'false';
  } catch {
    return true;
  }
}

const VIEW_TITLE = {
  inbox: 'Bandeja',
  david: STATUS_LABEL.assistant,
  waiting: STATUS_LABEL.waiting,
  mine: 'Mías',
  resolved: 'Resueltas',
};

function viewTitle(view: InboxView): string {
  return view.kind === 'useCase' ? useCaseLabelOf(view.useCase) : VIEW_TITLE[view.kind];
}

export default function ConversationsPage() {
  const { session, role } = useSession();
  const me = session?.user?.email;
  // Both attend; the admin also supervises every user's chats.
  const isAdmin = role === 'admin';
  const [view, setView] = useState<InboxView>({ kind: 'inbox' });
  const [userId, setUserId] = useState<string | null>(null);
  const { data: users } = useSWR(isAdmin ? '/api/advisor/users' : null, fetchUsers, {
    revalidateOnFocus: false,
  });
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<AdvisorChat | null>(null);
  const [busy, setBusy] = useState(false);
  // Same persisted open/closed state as the Agente section's sidebar.
  const isCollapsed = localStorage.getItem('sidebar:state') === 'false';
  // The customer context panel stays as the advisor last left it (open by default).
  const [contextOpen, setContextOpen] = useState(() => readContextOpen());
  function toggleContext() {
    const next = !contextOpen;
    setContextOpen(next);
    try {
      localStorage.setItem(CONTEXT_KEY, String(next));
    } catch {
      // Private mode: it just isn't remembered.
    }
  }

  // Counters in the views sidebar, on the same polling as the inbox.
  const { data: counts, mutate: mutateCounts } = useSWR(countsUrl(userId), fetchCounts, {
    refreshInterval: POLL_MS,
    revalidateOnFocus: false,
  });

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
        .filter((chat) =>
          matchesQuery(query, chat.customerName, chat.userEmail, chat.title),
        ),
    [pages, query],
  );
  const hasMore = pages?.at(-1)?.hasMore ?? false;

  function openView(next: InboxView) {
    setView(next);
    setSelected(null);
  }

  // An empty inbox means nobody needs a person; say what David has instead.
  const davidCount = counts?.david ?? 0;
  const inboxEmpty =
    view.kind === 'inbox' && !query ? (
      <span data-testid="inbox-empty-david">
        No hay casos para atender.
        {davidCount > 0 && (
          <>
            {' '}
            <button
              type="button"
              data-testid="inbox-empty-david-link"
              onClick={() => openView({ kind: 'david' })}
              className="text-primary hover:underline"
            >
              {ASSISTANT_NAME} está atendiendo {davidCount}{' '}
              {davidCount === 1 ? 'conversación' : 'conversaciones'}
            </button>
          </>
        )}
      </span>
    ) : undefined;

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
      mutateCounts();
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
        onViewChange={openView}
        isAdmin={isAdmin}
        users={users ?? []}
        userId={userId}
        onUserChange={setUserId}
        counts={counts}
      />
      <SidebarInset className="h-dvh min-h-0 overflow-hidden md:h-[calc(100dvh-1rem)]">
        <div className="flex h-full min-h-0">
          <div
            className={cn(
              'h-full min-w-0',
              // With the context panel open the list narrows, and on screens
              // under 1600px it steps aside so the chat keeps room.
              current
                ? cn(
                    'shrink-0 border-border border-r',
                    contextOpen ? 'hidden w-[380px] min-[1600px]:block' : 'w-[520px]',
                  )
                : 'flex-1',
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
              empty={pages ? inboxEmpty : undefined}
              onLoadMore={() => setSize(size + 1)}
            />
          </div>
          {current && (
            <div className="h-full min-w-0 flex-1">
              <ConversationView
                chat={current}
                bubbles={bubbles}
                me={me}
                busy={busy}
                contextOpen={contextOpen}
                onToggleContext={toggleContext}
                onTake={handleTake}
                onRelease={handleRelease}
                onSend={handleSend}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
          {current && contextOpen && <CustomerContextPanel key={current.id} chatId={current.id} />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
