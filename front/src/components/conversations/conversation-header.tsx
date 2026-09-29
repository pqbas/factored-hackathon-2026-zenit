import { ASSISTANT_NAME } from '@/lib/assistant';
import { Bot, PanelRight, X } from 'lucide-react';

import { handoffReasonStyle } from '@/components/conversations/use-case-style';
import { Button } from '@/components/ui/button';
import {
  type AdvisorChat,
  customerLabel,
  secondaryEmail,
  maskedCustomerId,
  isMine,
  statusOf,
  reasonTagOf,
  sectionLabel,
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
      aria-label={`${ASSISTANT_NAME} (asistente)`}
      title={`${ASSISTANT_NAME} (asistente)`}
      data-testid="assistant-switch"
      disabled={disabled}
      onClick={onToggle}
      className="flex h-8 shrink-0 items-center gap-2 rounded-full bg-secondary pr-2 pl-3 font-medium text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <Bot
        className={cn('size-4', on ? 'text-primary' : 'text-muted-foreground')}
        strokeWidth={1.8}
      />
      {/* No text label: the robot says it's David (name in the tooltip), so
          the customer's name and email keep their room. */}
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
  const tag = reasonTagOf(chat);
  const name = customerLabel(chat);
  const email = secondaryEmail(chat);
  const customerId = maskedCustomerId(chat);

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
        <span data-testid="customer-name" className="truncate font-semibold text-[15px]">
          {name}
        </span>
        {/* Second line: who the customer is and why they're here. The state
            and who has the chat live in the input's placeholder. */}
        {(email || customerId || tag) && (
          <span
            data-testid="customer-meta"
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs"
          >
            {/* The email never gets cut: the line wraps instead. */}
            {email && (
              <span data-testid="customer-email" className="whitespace-nowrap">
                {email}
              </span>
            )}
            {customerId && (
              <span data-testid="customer-id" className="shrink-0">
                Cliente {customerId}
              </span>
            )}
            {tag && (
              <span
                data-testid="use-case-tag"
                className={cn(
                  'shrink-0 rounded-md px-2 py-0.5 font-medium text-[11px]',
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
