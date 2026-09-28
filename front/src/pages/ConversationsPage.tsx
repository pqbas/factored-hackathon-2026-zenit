import { MessagesSquare } from 'lucide-react';
import { useMemo, useState } from 'react';

import { ConversationList } from '@/components/conversations/conversation-list';
import { ConversationView } from '@/components/conversations/conversation-view';
import { useIsMobile } from '@/hooks/use-mobile';
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
  const isMobile = useIsMobile();

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

  const showList = !isMobile || !selectedConversation;
  const showConversation = !isMobile || !!selectedConversation;

  return (
    <div className="flex h-dvh w-full">
      {showList && (
        <div className="w-full shrink-0 md:w-[30%] md:min-w-80">
          <ConversationList
            conversations={visibleConversations}
            selectedId={selectedId}
            onSelect={handleSelect}
            query={query}
            onQueryChange={setQuery}
          />
        </div>
      )}

      {showConversation && (
        <div className="flex-1">
          {selectedConversation ? (
            <ConversationView
              conversation={selectedConversation}
              onSend={handleSend}
              onBack={isMobile ? () => setSelectedId(null) : undefined}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessagesSquare className="h-10 w-10" />
              <p>Elige una conversación</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
