import { ArrowDown, Bot, Hourglass, UserRound } from 'lucide-react';
import { ASSISTANT_NAME } from '@/lib/assistant';
import { useEffect, useRef, useState } from 'react';

import { AdvisorComposer } from '@/components/conversations/advisor-composer';
import { ConversationHeader } from '@/components/conversations/conversation-header';
import {
  MessageBubble,
  SystemNotice,
} from '@/components/conversations/message-bubble';
import { conversationStatus, groupMessagesByDay } from '@/lib/conversations';
import { cn } from '@/lib/utils';
import type { MockConversation } from '@/mocks/conversations';

// How far from the end the advisor has to scroll before the jump button shows.
const SCROLL_THRESHOLD = 120;

const BANNER = {
  assistant: {
    icon: Bot,
    text: `${ASSISTANT_NAME} está respondiendo. Apágalo para escribir tú.`,
    className: 'text-tint-blue-foreground',
  },
  waiting: {
    icon: Hourglass,
    text: 'Esperando a un asesor · escribe para tomar la conversación.',
    className: 'text-tint-amber-foreground',
  },
  advisor: {
    icon: UserRound,
    text: `Estás atendiendo esta conversación. ${ASSISTANT_NAME} no responderá hasta que lo vuelvas a encender.`,
    className: 'text-primary',
  },
  resolved: {
    icon: Bot,
    text: `Conversación resuelta. Si el cliente escribe, responde ${ASSISTANT_NAME}.`,
    className: 'text-tint-green-foreground',
  },
};

export function ConversationView({
  conversation,
  onToggleAssistant,
  onSend,
  onAttach,
  onResolve,
  onAddTag,
}: {
  conversation: MockConversation;
  onToggleAssistant: () => void;
  onSend: (text: string) => void;
  onAttach: (file: File) => void;
  onResolve: () => void;
  onAddTag: (tag: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const now = new Date();
  const status = conversationStatus(conversation);
  const banner = BANNER[status];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [conversation.customerId, conversation.messages.length]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAwayFromBottom(
      el.scrollHeight - el.scrollTop - el.clientHeight > SCROLL_THRESHOLD,
    );
  }

  const groups = groupMessagesByDay(conversation.messages, now);

  return (
    <div className="flex h-full flex-col">
      <ConversationHeader
        conversation={conversation}
        onToggleAssistant={onToggleAssistant}
        onResolve={onResolve}
        onAddTag={onAddTag}
      />

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto bg-wa-chat-bg px-4 py-4 sm:px-8"
        >
          {groups.map((group) => (
            <div key={`${group.label}-${group.messages[0].id}`}>
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground text-xs">
                  {group.label}
                </span>
              </div>
              {group.messages.map((message) =>
                message.from === 'system' ? (
                  <SystemNotice key={message.id} message={message} now={now} />
                ) : (
                  <MessageBubble key={message.id} message={message} now={now} />
                ),
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {awayFromBottom && (
          <button
            type="button"
            aria-label="Ir al último mensaje"
            data-testid="scroll-to-bottom"
            onClick={() =>
              bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
            }
            className="absolute right-6 bottom-3 flex size-10 items-center justify-center rounded-full bg-secondary text-foreground shadow-lg"
          >
            <ArrowDown className="size-4" strokeWidth={2.2} />
          </button>
        )}
      </div>

      <div
        data-testid="status-banner"
        className="flex items-center justify-center gap-1.5 px-4 pt-2 text-[11px] text-muted-foreground"
      >
        <banner.icon
          className={cn('size-3 shrink-0', banner.className)}
          strokeWidth={2.2}
        />
        {banner.text}
      </div>

      <AdvisorComposer
        key={conversation.customerId}
        disabled={conversation.handledBy === 'ai_agent'}
        onSend={onSend}
        onAttach={onAttach}
      />
    </div>
  );
}
