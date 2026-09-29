import { ASSISTANT_NAME } from '@/lib/assistant';
import { ArrowDown, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { AdvisorComposer } from '@/components/conversations/advisor-composer';
import { ConversationHeader } from '@/components/conversations/conversation-header';
import {
  MessageBubble,
  SystemNotice,
} from '@/components/conversations/message-bubble';
import { HandoffReasonChip } from '@/components/conversations/use-case-style';
import {
  type AdvisorChat,
  type Bubble,
  canReply,
  isDavidReplying,
  isHeldByOther,
  statusOf,
} from '@/lib/advisor';
import { TypingIndicator } from '@/components/typing-indicator';
import { groupByDay, STATUS_LABEL } from '@/lib/conversations';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

// How far from the end the advisor has to scroll before the jump button shows.
const SCROLL_THRESHOLD = 120;

// The input's line says the state and who has the chat (the header doesn't).
function placeholderFor(chat: AdvisorChat, me: string | undefined): string {
  if (canReply(chat, me)) return 'Escribe al cliente…';
  if (isHeldByOther(chat, me)) {
    const email = chat.assignedTo ?? '';
    return email ? `La atiende ${email.split('@')[0]} (${email})` : 'La atiende otra persona';
  }
  switch (statusOf(chat)) {
    case 'waiting':
      return 'En espera · tómala para responder';
    case 'resolved':
      return 'Resuelta';
    default:
      return `La atiende ${ASSISTANT_NAME}`;
  }
}

export interface TimelineSegment {
  chat: AdvisorChat;
  bubbles: Bubble[];
}

// Where one of the customer's conversations starts: its date, reason and
// state. The active one shows only the date (the header has the rest).
function ConversationDivider({ chat, active }: { chat: AdvisorChat; active: boolean }) {
  // The handoff reason if this conversation was handed off; never the
  // classifier's intent.
  const reason = chat.handoff?.reason ?? null;
  return (
    <div
      data-testid="conversation-divider"
      data-chat-id={chat.id}
      className="my-4 flex items-center gap-3 text-muted-foreground text-xs"
    >
      <span className="h-px flex-1 bg-border" />
      <span className="flex items-center gap-2 whitespace-nowrap">
        <span>Conversación del {format(parseISO(chat.createdAt), "d MMM yyyy, HH:mm", { locale: es })}</span>
        {!active && reason && <HandoffReasonChip id={reason} />}
        {!active && (
          <span data-testid="divider-status" className="font-medium text-foreground/80">
            {STATUS_LABEL[statusOf(chat)]}
          </span>
        )}
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

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto bg-wa-chat-bg px-4 py-4 sm:px-8"
        >
          {segments.map((segment, index) => (
            <section key={segment.chat.id} data-testid="timeline-segment">
              {withDividers && (
                <ConversationDivider chat={segment.chat} active={index === segments.length - 1} />
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

      {/* State and who has the chat are in the header and the input's
          placeholder: no line repeating them here. */}
      <div className="pt-2" />

      <AdvisorComposer
        key={chat.id}
        disabled={!canReply(chat, me)}
        placeholder={placeholderFor(chat, me)}
        icon={isHeldByOther(chat, me) ? <UserRound className="size-4" strokeWidth={1.8} /> : undefined}
        onSend={onSend}
      />
    </div>
  );
}
