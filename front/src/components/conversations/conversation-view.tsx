import { CheckCheck, SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { avatarColor } from '@/components/conversations/conversation-list';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatListTime, getInitials, groupMessagesByDay } from '@/lib/conversations';
import { cn } from '@/lib/utils';
import type { MockConversation } from '@/mocks/conversations';

export function ConversationView({
  conversation,
  onSend,
}: {
  conversation: MockConversation;
  onSend: (text: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const now = new Date();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [conversation.customerId, conversation.messages.length]);

  const groups = groupMessagesByDay(conversation.messages, now);

  function handleSend() {
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-3 py-2">
        <SidebarToggle />
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-medium text-sm text-white',
            avatarColor(conversation.customerId),
          )}
        >
          {getInitials(conversation.name)}
        </div>
        <span className="font-medium">{conversation.name}</span>
      </div>

      <div className="flex-1 overflow-y-auto bg-wa-chat-bg px-4 py-4 sm:px-8">
        {groups.map((group) => (
          <div key={`${group.label}-${group.messages[0].id}`}>
            <div className="my-3 flex justify-center">
              <span className="rounded-full bg-background px-3 py-1 text-muted-foreground text-xs shadow-sm">
                {group.label}
              </span>
            </div>
            {group.messages.map((message) => {
              const isAgent = message.from === 'agent';
              return (
                <div
                  key={message.id}
                  data-testid={isAgent ? 'bubble-agent' : 'bubble-customer'}
                  className={cn(
                    'mb-2 flex',
                    isAgent ? 'justify-end' : 'justify-start',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[80%] rounded-[18px] px-3.5 py-2 sm:max-w-[65%]',
                      isAgent
                        ? 'bg-wa-agent-bubble text-primary-foreground'
                        : 'bg-wa-customer-bubble text-foreground',
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {message.text}
                    </p>
                    <div className="mt-1 flex items-center justify-end gap-1">
                      <span
                        className={cn(
                          'text-[11px]',
                          isAgent
                            ? 'text-primary-foreground/75'
                            : 'text-muted-foreground',
                        )}
                      >
                        {formatListTime(message.sentAt, now)}
                      </span>
                      {isAgent && (
                        <CheckCheck className="h-3.5 w-3.5 text-wa-check" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 px-4 pt-2 pb-4">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Mensaje"
          className="h-[46px] rounded-full border-input bg-background px-5"
        />
        <Button
          type="button"
          size="icon"
          onClick={handleSend}
          disabled={!draft.trim()}
          className="shrink-0 rounded-full"
        >
          <SendHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
