import type { ReactNode } from 'react';
import { Bot, Search, UserRound } from 'lucide-react';

import { HandoffReasonChip } from '@/components/conversations/use-case-style';
import { ASSISTANT_NAME } from '@/lib/assistant';
import { SidebarToggle } from '@/components/sidebar-toggle';
import {
  type AdvisorChat,
  attentionOf,
  customerKeyOf,
  customerLabel,
  groupByHandoffReason,
  holderLabel,
  type InboxItem,
  lastActivityAt,
  rowText,
} from '@/lib/advisor';
import { avatarColor, formatListTime, getInitials, STATUS_LABEL } from '@/lib/conversations';
import { handoffDetail, handoffReasonLabel } from '@/lib/handoff-case';
import { cn } from '@/lib/utils';

function Row({
  chat,
  me,
  selected,
  compact,
  onOpen,
}: {
  chat: InboxItem;
  me: string | undefined;
  selected: boolean;
  compact: boolean;
  onOpen: () => void;
}) {
  const attention = attentionOf(chat, me);
  // The inbox API has no unread count: the dot marks chats waiting for someone.
  const waiting = !chat.closedAt && chat.handledBy === 'human_queue';
  const withDavid = !chat.closedAt && chat.handledBy === 'ai_agent';
  const holder = holderLabel(chat, me);
  const detail = handoffDetail(chat.handoff);

  return (
    <button
      type="button"
      data-testid={`conversation-row-${chat.id}`}
      aria-selected={selected}
      onClick={onOpen}
      className={cn(
        // Each row spans the list's grid so columns line up across rows and
        // sections: the name column is as wide as the longest name (capped).
        'col-span-full grid h-11 grid-cols-subgrid items-center rounded-[10px] text-left transition-colors',
        selected ? 'bg-sidebar-accent' : 'hover:bg-secondary/60',
      )}
    >
      {/* Edge columns give the row its inner margin (a subgrid row can't use
          padding without eating its first and last columns). */}
      <span />
      <span
        data-testid={waiting ? 'waiting-dot' : undefined}
        className={cn('size-2 rounded-full', waiting ? 'bg-primary' : 'bg-transparent')}
      />
      <span
        aria-hidden="true"
        className={cn(
          'flex size-7 items-center justify-center rounded-full font-medium text-[11px] text-white',
          avatarColor(chat.userId),
        )}
      >
        {getInitials(customerLabel(chat))}
      </span>
      <span
        data-testid="row-name"
        title={chat.userEmail ?? undefined}
        className="min-w-0 truncate font-semibold text-sm"
      >
        {customerLabel(chat)}
      </span>
      {/* Who has the chat, between name and subject: David's robot, or the
          advisor who took it. Empty while it waits. */}
      <span className="flex min-w-0 items-center">
        {holder && (
          <span
            data-testid="advisor-badge"
            title={`Lo atiende ${chat.assignedTo ?? holder}`}
            className="flex min-w-0 max-w-full items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground"
          >
            <UserRound className="size-3 shrink-0" strokeWidth={2} />
            <span className="truncate">{holder}</span>
          </span>
        )}
        {withDavid && (
          <span
            data-testid="david-icon"
            title={`${STATUS_LABEL.assistant}: lo atiende ${ASSISTANT_NAME}`}
            aria-label={`${STATUS_LABEL.assistant}: lo atiende ${ASSISTANT_NAME}`}
            className="flex text-muted-foreground"
          >
            <Bot className="size-4" strokeWidth={1.8} />
          </span>
        )}
      </span>
      {/* The customer's last message; the subject (chat title) stays as the
          tooltip. */}
      <span className="flex min-w-0 items-center gap-2 overflow-hidden">
        {/* The detail of an open case David handed off (the reason is the
            section's or the view's); nothing when there is no detail. The
            narrow list (a chat is open) leaves it to the context panel. */}
        {chat.hasHandoff && detail && !compact && (
          <span
            data-testid="row-handoff"
            title={handoffReasonLabel(chat.handoff?.reason)}
            className="shrink-0 rounded-md bg-primary/15 px-1.5 py-0.5 font-medium text-[11px] text-primary"
          >
            {detail}
          </span>
        )}
        <span
          data-testid="row-text"
          title={chat.title}
          className="min-w-0 truncate text-muted-foreground text-sm"
        >
          {rowText(chat)}
        </span>
      </span>
      <span
        data-testid={attention ? 'attention' : undefined}
        className="whitespace-nowrap text-muted-foreground text-xs"
      >
        {attention?.text}
      </span>
      <span className="text-right text-muted-foreground text-xs">
        {formatListTime(lastActivityAt(chat), new Date())}
      </span>
      <span />
    </button>
  );
}

// The inbox list: grouped by use case in "Bandeja", flat in any other view.
export function InboxList({
  title,
  chats,
  grouped,
  me,
  selectedKey,
  onOpen,
  query,
  onQueryChange,
  compact,
  hasMore,
  onLoadMore,
  empty,
}: {
  title: string;
  // One per customer, with their latest conversation.
  chats: InboxItem[];
  grouped: boolean;
  me: string | undefined;
  selectedKey: string | null;
  onOpen: (customerKey: string) => void;
  query: string;
  onQueryChange: (query: string) => void;
  compact: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  // Replaces the generic empty message.
  empty?: ReactNode;
}) {
  const groups = grouped
    ? groupByHandoffReason(chats)
    : [{ id: 'all', label: '', chats }];
  const row = (chat: InboxItem) => (
    <Row
      key={customerKeyOf(chat)}
      chat={chat}
      me={me}
      selected={customerKeyOf(chat) === selectedKey}
      compact={compact}
      onOpen={() => onOpen(customerKeyOf(chat))}
    />
  );

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-3 px-6 pt-4 pb-3">
        <SidebarToggle />
        <h1 data-testid="inbox-title" className="font-semibold text-xl tracking-tight">
          {title}
        </h1>
        <span className="whitespace-nowrap text-muted-foreground text-sm">
          {chats.length} {chats.length === 1 ? 'cliente' : 'clientes'}
        </span>
        <div className={cn('relative ml-auto', compact ? 'w-32' : 'w-60')}>
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar"
            aria-label="Buscar cliente"
            className="h-8 w-full rounded-lg bg-secondary pr-2 pl-8 text-[13px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pt-1.5 pb-6">
        {chats.length === 0 && (
          <p
            data-testid="inbox-empty"
            className="py-10 text-center text-muted-foreground text-sm"
          >
            {empty ?? 'No hay conversaciones en esta vista.'}
          </p>
        )}
        {/* One grid for every row: margin | dot | avatar | name | David |
            subject | state | time | margin. Sections are subgrids too, so all
            rows align. */}
        <div
          className={cn(
            'grid gap-x-3',
            compact
              ? 'grid-cols-[0_0.5rem_1.75rem_fit-content(8rem)_6rem_minmax(0,1fr)_auto_auto_0]'
              : 'grid-cols-[0_0.5rem_1.75rem_fit-content(15rem)_6rem_minmax(0,1fr)_auto_auto_0]',
          )}
        >
          {groups.map((group, index) => (
            <section
              key={group.id}
              data-testid={grouped ? `inbox-section-${group.id}` : undefined}
              className={cn(
                'col-span-full grid grid-cols-subgrid gap-y-1',
                grouped && index > 0 && 'mt-6',
              )}
            >
              {grouped && (
                <div className="col-span-full px-3 pb-1.5">
                  <HandoffReasonChip id={group.id} />
                </div>
              )}
              {group.chats.map(row)}
            </section>
          ))}
        </div>
        {hasMore && (
          <button
            type="button"
            data-testid="inbox-load-more"
            onClick={onLoadMore}
            className="mx-3 mt-4 h-8 rounded-lg px-3 text-muted-foreground text-xs hover:bg-secondary hover:text-foreground"
          >
            Cargar más
          </button>
        )}
      </div>
    </div>
  );
}
