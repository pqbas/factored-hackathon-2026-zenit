import { MessagesSquare } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ConversationList } from '@/components/conversations/conversation-list';
import { ConversationView } from '@/components/conversations/conversation-view';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { filterConversations, sortByLastMessage } from '@/lib/conversations';
import { MOCK_CONVERSATIONS, type MockMessage } from '@/mocks/conversations';

export default function ConversationsPage() {
  // Local copy so sends/reads don't mutate the module-level mock data;
  // reloading the page restores the original mocks.
  const [conversations, setConversations] = useState(() =>
    structuredClone(MOCK_CONVERSATIONS),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Same persisted open/closed state as the Agente section's sidebar.
  const isCollapsed = localStorage.getItem('sidebar:state') === 'false';

  const visibleConversations = useMemo(
    () => sortByLastMessage(filterConversations(conversations, query)),
    [conversations, query],
  );

  const selectedConversation =
    conversations.find((c) => c.customerId === selectedId) ?? null;

  function handleSelect(customerId: string) {
    setSelectedId(customerId);
    setConversations((prev) =>
      prev.map((c) => (c.customerId === customerId ? { ...c, unread: 0 } : c)),
    );
  }

  function handleSend(text: string) {
    if (!selectedId) return;
    const message: MockMessage = {
      id: `mock-msg-${crypto.randomUUID()}`,
      from: 'agent',
      text,
      sentAt: new Date().toISOString(),
    };
    setConversations((prev) =>
      prev.map((c) =>
        c.customerId === selectedId
          ? { ...c, messages: [...c.messages, message] }
          : c,
      ),
    );
  }

  return (
    <SidebarProvider defaultOpen={!isCollapsed}>
      <ConversationList
        conversations={visibleConversations}
        selectedId={selectedId}
        onSelect={handleSelect}
        query={query}
        onQueryChange={setQuery}
      />
      <SidebarInset className="h-dvh min-h-0">
        {selectedConversation ? (
          <ConversationView
            conversation={selectedConversation}
            onSend={handleSend}
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
