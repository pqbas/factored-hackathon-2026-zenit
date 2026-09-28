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
