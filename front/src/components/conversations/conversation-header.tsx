import { Bot } from 'lucide-react';

import { avatarColor } from '@/components/conversations/conversation-list';
import { StatusInline } from '@/components/conversations/status-chip';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import {
  type AdvisorChat,
  customerLabel,
  isHeldByOther,
  statusOf,
  useCaseLabel,
} from '@/lib/advisor';
import { getInitials } from '@/lib/conversations';
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
      <span className="hidden sm:inline">Asistente</span>
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
  isAdmin,
  busy,
  onTake,
  onRelease,
}: {
  chat: AdvisorChat;
  me: string | undefined;
  isAdmin: boolean;
  busy: boolean;
  onTake: (force: boolean) => void;
  onRelease: (outcome: 'returned_to_agent' | 'resolved') => void;
}) {
  const status = statusOf(chat);
  const mine = !chat.closedAt && !!me && chat.assignedTo === me;
  const heldByOther = isHeldByOther(chat, me);
  const name = customerLabel(chat);

  return (
    <header className="flex items-center gap-3 border-border border-b px-3 py-2.5 sm:px-4">
      <SidebarToggle />
      <div
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full font-medium text-sm text-white',
          avatarColor(chat.userId),
        )}
      >
        {getInitials(name)}
      </div>
      <div className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="truncate font-semibold text-[15px]">{name}</span>
          <StatusInline status={status} />
        </span>
        <span
          data-testid="customer-meta"
          className="truncate text-muted-foreground text-xs"
        >
          {useCaseLabel(chat)}
          {mine && ' · La atiendes tú'}
          {heldByOther && ` · La atiende ${chat.assignedTo}`}
        </span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {status === 'assistant' || status === 'resolved' ? (
          <AssistantSwitch on disabled={busy} onToggle={() => onTake(false)} />
        ) : null}
        {status === 'waiting' && (
          <Button
            type="button"
            size="sm"
            data-testid="take-button"
            disabled={busy}
            onClick={() => onTake(false)}
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
        {heldByOther && isAdmin && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            data-testid="force-take-button"
            disabled={busy}
            onClick={() => onTake(true)}
            className="h-8 rounded-full px-3 text-xs"
          >
            Tomar de todos modos
          </Button>
        )}
      </div>
    </header>
  );
}
