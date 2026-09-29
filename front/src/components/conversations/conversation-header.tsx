import { ASSISTANT_KIND, ASSISTANT_NAME } from '@/lib/assistant';
import { Bot, PanelRight, X } from 'lucide-react';

import { handoffReasonStyle } from '@/components/conversations/use-case-style';
import { Button } from '@/components/ui/button';
import {
  type AdvisorChat,
  customerLabel,
  secondaryEmail,
  isMine,
  statusOf,
  reasonTagOf,
  sectionLabel,
  attentionOf,
} from '@/lib/advisor';
import { avatarColor, getInitials } from '@/lib/conversations';
import { cn } from '@/lib/utils';

function AssistantSwitch({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-testid="assistant-switch"
      disabled={disabled}
      onClick={onToggle}
      className="flex h-8 shrink-0 items-center gap-2 rounded-full bg-secondary pr-2 pl-3 font-medium text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <Bot
        className={cn('size-4', on ? 'text-primary' : 'text-muted-foreground')}
        strokeWidth={1.8}
      />
      <span className="hidden sm:inline" title={ASSISTANT_KIND}>
        {ASSISTANT_NAME} (asistente)
      </span>
      <span className="w-6 text-left">{on ? 'ON' : 'OFF'}</span>
      <span
        className={cn(
          'flex h-5 w-9 items-center rounded-full p-0.5 transition-colors',
          on ? 'justify-end bg-primary' : 'justify-start bg-input',
        )}
      >
        <span className="size-4 rounded-full bg-white shadow-sm" />
      </span>
    </button>
  );
}

export function ConversationHeader({
  chat,
  me,
  busy,
  contextOpen,
  onToggleContext,
  onTake,
  onRelease,
  onClose,
}: {
  chat: AdvisorChat;
  me: string | undefined;
  busy: boolean;
  contextOpen: boolean;
  onToggleContext: () => void;
  onTake: () => void;
  onRelease: (outcome: 'returned_to_agent' | 'resolved') => void;
  onClose: () => void;
}) {
  const status = statusOf(chat);
  const mine = isMine(chat, me);
  const attention = attentionOf(chat, me, { long: true });
  const tag = reasonTagOf(chat);
  const name = customerLabel(chat);
  const email = secondaryEmail(chat);

  return (
    <header className="flex items-center gap-3 border-border border-b px-4 py-3">
      <button
        type="button"
        aria-label="Cerrar conversación"
        data-testid="close-conversation"
        onClick={onClose}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <X className="size-4" />
      </button>
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full font-medium text-sm text-white',
          avatarColor(chat.userId),
        )}
      >
        {getInitials(name)}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span data-testid="customer-name" className="truncate font-semibold text-[15px]">
            {name}
          </span>
          {email && (
            <span data-testid="customer-email" className="truncate text-muted-foreground text-xs">
              {email}
            </span>
          )}
        </span>
        {(attention || tag) && (
          <span
            data-testid="customer-meta"
            className="flex min-w-0 items-center gap-2 text-muted-foreground text-xs"
          >
            {attention && (
              <span data-testid="attention" className="whitespace-nowrap">
                {attention.text}
              </span>
            )}
            {tag && (
              <span
                data-testid="use-case-tag"
                className={cn(
                  'truncate rounded-md px-2 py-0.5 font-medium text-[11px]',
                  handoffReasonStyle(tag).chip,
                )}
              >
                {sectionLabel(tag)}
              </span>
            )}
          </span>
        )}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          data-testid="context-toggle"
          aria-pressed={contextOpen}
          onClick={onToggleContext}
          className={cn(
            'flex h-8 items-center gap-1.5 rounded-full px-3 font-semibold text-xs transition-colors',
            contextOpen ? 'bg-primary/15 text-primary' : 'bg-secondary text-foreground hover:bg-accent',
          )}
        >
          <PanelRight className="size-3.5" strokeWidth={1.9} />
          Contexto
        </button>
        {(status === 'assistant' || status === 'resolved') && (
          <AssistantSwitch on disabled={busy} onToggle={onTake} />
        )}
        {status === 'waiting' && (
          <Button
            type="button"
            size="sm"
            data-testid="take-button"
            disabled={busy}
            onClick={onTake}
            className="h-8 rounded-full px-4 text-xs"
          >
            Tomar
          </Button>
        )}
        {mine && (
          <>
            <AssistantSwitch
              on={false}
              disabled={busy}
              onToggle={() => onRelease('returned_to_agent')}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="resolve-button"
              disabled={busy}
              onClick={() => onRelease('resolved')}
              className="h-8 rounded-full px-3 text-xs"
            >
              Resolver
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
