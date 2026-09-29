import { ASSISTANT_NAME } from '@/lib/assistant';
import { ArrowDown, Bot, Hourglass, Lock, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AdvisorComposer } from '@/components/conversations/advisor-composer';
import { ConversationHeader } from '@/components/conversations/conversation-header';
import {
  MessageBubble,
  SystemNotice,
} from '@/components/conversations/message-bubble';
import { useCaseStyle } from '@/components/conversations/use-case-style';
import {
  type AdvisorChat,
  type Bubble,
  canReply,
  useCaseOf,
  useCaseTag,
  isDavidReplying,
  isHeldByOther,
  statusOf,
} from '@/lib/advisor';
import { TypingIndicator } from '@/components/typing-indicator';
import { HandoffCard } from '@/components/conversations/handoff-card';
import { groupByDay, STATUS_LABEL } from '@/lib/conversations';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
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

export interface TimelineSegment {
  chat: AdvisorChat;
  bubbles: Bubble[];
}

// Where one of the customer's conversations starts: its date, use case and state.
function ConversationDivider({ chat }: { chat: AdvisorChat }) {
  const tag = useCaseTag(chat);
  return (
    <div
      data-testid="conversation-divider"
      data-chat-id={chat.id}
      className="my-4 flex items-center gap-3 text-muted-foreground text-xs"
    >
      <span className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-2 whitespace-nowrap">
        <span>Conversación del {format(parseISO(chat.createdAt), "d MMM yyyy, HH:mm", { locale: es })}</span>
        {tag && (
          <span
            className={cn(
              'rounded-md px-2 py-0.5 font-medium text-[11px]',
              useCaseStyle(useCaseOf(chat)).chip,
            )}
          >
            {tag}
          </span>
        )}
        <span data-testid="divider-status" className="font-medium text-foreground/80">
          {STATUS_LABEL[statusOf(chat)]}
        </span>
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function DayGroups({ bubbles, now, skipFirstLabel }: { bubbles: Bubble[]; now: Date; skipFirstLabel: boolean }) {
  return (
    <>
      {groupByDay(bubbles, now).map((group, index) => (
        <div key={`${group.label}-${group.items[0].id}`}>
          {!(skipFirstLabel && index === 0) && (
            <div className="my-3 flex justify-center">
              <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground text-xs">
                {group.label}
              </span>
            </div>
          )}
          {group.items.map((bubble) =>
            bubble.from === 'system' ? (
              <SystemNotice key={bubble.id} bubble={bubble} now={now} />
            ) : (
              <MessageBubble key={bubble.id} bubble={bubble} now={now} />
            ),
          )}
        </div>
      ))}
    </>
  );
}

export function ConversationView({
  chat,
  segments,
  me,
  busy,
  contextOpen,
  onToggleContext,
  onTake,
  onRelease,
  onSend,
  onClose,
}: {
  // The active (latest) conversation; actions and the composer apply to it.
  chat: AdvisorChat;
  // Every conversation of the customer, oldest first, the active one last.
  segments: TimelineSegment[];
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
  const bubbles = segments.at(-1)?.bubbles ?? [];
  const bubbleCount = segments.reduce((n, segment) => n + segment.bubbles.length, 0);
  const davidReplying = isDavidReplying(chat, bubbles, now);
  // A single conversation keeps the plain day layout; several get dividers.
  const withDividers = segments.length > 1;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.id, bubbleCount, davidReplying]);

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

      {/* The active conversation's case stays in view above the messages. */}
      {chat.handoff && (
        <div className="border-border border-b px-4 py-2.5 sm:px-8">
          <HandoffCard key={chat.id} handoff={chat.handoff} defaultOpen={!!chat.hasHandoff} />
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto bg-wa-chat-bg px-4 py-4 sm:px-8"
        >
          {segments.map((segment, index) => (
            <section key={segment.chat.id} data-testid="timeline-segment">
              {withDividers && <ConversationDivider chat={segment.chat} />}
              {/* Earlier conversations keep their case, folded. */}
              {index < segments.length - 1 && segment.chat.handoff && (
                <HandoffCard handoff={segment.chat.handoff} defaultOpen={false} className="mb-3" />
              )}
              <DayGroups bubbles={segment.bubbles} now={now} skipFirstLabel={withDividers} />
            </section>
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
