import { type ConversationStatus, STATUS_LABEL } from '@/lib/conversations';
import { cn } from '@/lib/utils';

const STATUS_TONE: Record<ConversationStatus, string> = {
  waiting: 'bg-tint-amber text-tint-amber-foreground',
  assistant: 'bg-tint-blue text-tint-blue-foreground',
  advisor: 'bg-sidebar-accent text-primary',
  resolved: 'bg-tint-green text-tint-green-foreground',
};

export function StatusChip({
  status,
  size = 'sm',
}: {
  status: ConversationStatus;
  size?: 'sm' | 'md';
}) {
  return (
    <span
      data-testid="status-chip"
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-px text-[10px]' : 'px-2.5 py-1 text-xs',
        STATUS_TONE[status],
      )}
    >
      {size === 'md' && <span className="size-1.5 rounded-full bg-current" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

const STATUS_DOT: Record<ConversationStatus, string> = {
  waiting: 'bg-tint-amber-foreground',
  assistant: 'bg-tint-blue-foreground',
  advisor: 'bg-primary',
  resolved: 'bg-tint-green-foreground',
};

// Quiet one-liner for list rows: a colored dot, the status and the topic.
export function StatusLine({
  status,
  topic,
}: {
  status: ConversationStatus;
  topic: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 font-normal text-[11px] text-sidebar-foreground/55">
      <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[status])} />
      <span data-testid="status-chip" className="shrink-0">
        {STATUS_LABEL[status]}
      </span>
      <span className="truncate">· {topic}</span>
    </span>
  );
}

// Inline status for the conversation header, next to the customer's name.
export function StatusInline({ status }: { status: ConversationStatus }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 font-normal text-muted-foreground text-xs">
      <span className={cn('size-1.5 rounded-full', STATUS_DOT[status])} />
      <span data-testid="status-chip">{STATUS_LABEL[status]}</span>
    </span>
  );
}

export function TagChip({
  label,
  tone = 'topic',
  size = 'sm',
}: {
  label: string;
  tone?: 'topic' | 'neutral';
  size?: 'sm' | 'md';
}) {
  return (
    <span
      data-testid="tag-chip"
      className={cn(
        'inline-flex shrink-0 items-center rounded-full',
        size === 'sm'
          ? 'px-2 py-px font-semibold text-[10px]'
          : 'px-2.5 py-1 font-medium text-xs',
        tone === 'topic'
          ? 'bg-tint-blue text-tint-blue-foreground'
          : 'bg-secondary text-muted-foreground',
      )}
    >
      {label}
    </span>
  );
}
