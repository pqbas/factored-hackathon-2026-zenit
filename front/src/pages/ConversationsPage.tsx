import { MessagesSquare } from 'lucide-react';
import { useMemo, useReducer, useState } from 'react';

import { ConversationList } from '@/components/conversations/conversation-list';
import { ConversationView } from '@/components/conversations/conversation-view';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import {
  conversationReducer,
  countByStatus,
  filterByStatus,
  filterConversations,
  type StatusFilter,
  sortByLastMessage,
} from '@/lib/conversations';
import { MOCK_CONVERSATIONS } from '@/mocks/conversations';

export default function ConversationsPage() {
  // Local copy so the advisor's actions don't mutate the module-level mock
  // data; reloading the page restores the original mocks.
  const [conversations, dispatch] = useReducer(conversationReducer, undefined, () =>
    structuredClone(MOCK_CONVERSATIONS),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Same persisted open/closed state as the Agente section's sidebar.
  const isCollapsed = localStorage.getItem('sidebar:state') === 'false';

  const visibleConversations = useMemo(
    () =>
      sortByLastMessage(
        filterByStatus(filterConversations(conversations, query), statusFilter),
      ),
    [conversations, query, statusFilter],
  );
  const counts = useMemo(() => countByStatus(conversations), [conversations]);

  const selected = conversations.find((c) => c.customerId === selectedId) ?? null;

  function handleSelect(customerId: string) {
    setSelectedId(customerId);
    dispatch({ type: 'select', customerId });
  }

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <ConversationList
        conversations={visibleConversations}
        selectedId={selectedId}
        onSelect={handleSelect}
        query={query}
        onQueryChange={setQuery}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        counts={counts}
      />
      <SidebarInset className="h-dvh min-h-0 overflow-hidden md:h-[calc(100dvh-1rem)]">
        {selected ? (
          <ConversationView
            conversation={selected}
            onToggleAssistant={() =>
              dispatch({ type: 'toggleAssistant', customerId: selected.customerId })
            }
            onSend={(text) =>
              dispatch({
                type: 'send',
                customerId: selected.customerId,
                text,
                sentAt: new Date().toISOString(),
              })
            }
            onAttach={(file) =>
              dispatch({
                type: 'attach',
                customerId: selected.customerId,
                // Shown only in this tab; nothing is uploaded.
                attachment: {
                  url: URL.createObjectURL(file),
                  alt: file.name,
                  redactions: [],
                },
                sentAt: new Date().toISOString(),
              })
            }
            onResolve={() =>
              dispatch({
                type: 'resolve',
                customerId: selected.customerId,
                sentAt: new Date().toISOString(),
              })
            }
            onAddTag={(tag) =>
              dispatch({ type: 'addTag', customerId: selected.customerId, tag })
            }
          />
        ) : (
          <div className="flex h-full flex-col">
            <div className="px-2 py-1.5">
              <SidebarToggle />
            </div>
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessagesSquare className="h-10 w-10" />
              <p>Elige una conversación</p>
            </div>
          </div>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
