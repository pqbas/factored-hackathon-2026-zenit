import { ASSISTANT_NAME } from '@/lib/assistant';
import { ArrowDown, Bot, Hourglass, Lock, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AdvisorComposer } from '@/components/conversations/advisor-composer';
import { ConversationHeader } from '@/components/conversations/conversation-header';
import {
  MessageBubble,
  SystemNotice,
} from '@/components/conversations/message-bubble';
import {
  type AdvisorChat,
  type Bubble,
  canReply,
  isDavidReplying,
  isHeldByOther,
  statusOf,
} from '@/lib/advisor';
import { TypingIndicator } from '@/components/typing-indicator';
import { groupByDay } from '@/lib/conversations';
import { cn } from '@/lib/utils';

// How far from the end the advisor has to scroll before the jump button shows.
const SCROLL_THRESHOLD = 120;

function hint(chat: AdvisorChat, me: string | undefined) {
  if (isHeldByOther(chat, me)) {
    return {
      icon: Lock,
      text: `La atiende ${chat.assignedTo}. Solo quien la tomó puede responder.`,
      className: 'text-muted-foreground',
    };
  }
  switch (statusOf(chat)) {
    case 'waiting':
      return {
        icon: Hourglass,
        text: 'Esperando a un asesor · tómala para responder.',
        className: 'text-tint-amber-foreground',
      };
    case 'advisor':
      return {
        icon: UserRound,
        text: `Estás atendiendo esta conversación. ${ASSISTANT_NAME} no responderá hasta que la devuelvas.`,
        className: 'text-primary',
      };
    case 'resolved':
      return {
        icon: Bot,
        text: `Conversación resuelta. Si el cliente escribe, responde ${ASSISTANT_NAME}.`,
        className: 'text-tint-green-foreground',
      };
    default:
      return {
        icon: Bot,
        text: `${ASSISTANT_NAME} está respondiendo. Apágalo para tomar la conversación.`,
        className: 'text-tint-blue-foreground',
      };
  }
}

function placeholderFor(chat: AdvisorChat, me: string | undefined): string {
  if (canReply(chat, me)) return 'Escribe al cliente…';
  if (isHeldByOther(chat, me)) return 'La atiende otra persona';
  if (statusOf(chat) === 'assistant') return `${ASSISTANT_NAME} está respondiendo…`;
  return 'Toma la conversación para responder';
}

export function ConversationView({
  chat,
  bubbles,
  me,
  busy,
  contextOpen,
  onToggleContext,
  onTake,
  onRelease,
  onSend,
  onClose,
}: {
  chat: AdvisorChat;
  bubbles: Bubble[];
  me: string | undefined;
  busy: boolean;
  contextOpen: boolean;
  onToggleContext: () => void;
  onTake: () => void;
  onRelease: (outcome: 'returned_to_agent' | 'resolved') => void;
  onSend: (text: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const now = new Date();
  const banner = hint(chat, me);
  const davidReplying = isDavidReplying(chat, bubbles, now);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.id, bubbles.length, davidReplying]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setAwayFromBottom(
      el.scrollHeight - el.scrollTop - el.clientHeight > SCROLL_THRESHOLD,
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ConversationHeader
        chat={chat}
        me={me}
        busy={busy}
        contextOpen={contextOpen}
        onToggleContext={onToggleContext}
        onTake={onTake}
        onRelease={onRelease}
        onClose={onClose}
      />

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto bg-wa-chat-bg px-4 py-4 sm:px-8"
        >
          {groupByDay(bubbles, now).map((group) => (
            <div key={`${group.label}-${group.items[0].id}`}>
              <div className="my-3 flex justify-center">
                <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground text-xs">
                  {group.label}
                </span>
              </div>
              {group.items.map((bubble) =>
                bubble.from === 'system' ? (
                  <SystemNotice key={bubble.id} bubble={bubble} now={now} />
                ) : (
                  <MessageBubble key={bubble.id} bubble={bubble} now={now} />
                ),
              )}
            </div>
          ))}
          {davidReplying && (
            <div className="mb-2 flex justify-end">
              <div className="rounded-[18px] bg-wa-agent-bubble px-3.5 py-2 text-primary-foreground">
                <TypingIndicator />
              </div>
            </div>
          )}
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
        <banner.icon className={cn('size-3 shrink-0', banner.className)} strokeWidth={2.2} />
        {banner.text}
      </div>

      <AdvisorComposer
        key={chat.id}
        disabled={!canReply(chat, me)}
        placeholder={placeholderFor(chat, me)}
        onSend={onSend}
      />
    </div>
  );
}
