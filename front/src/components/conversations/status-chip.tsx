import { type ConversationStatus, STATUS_LABEL } from '@/lib/conversations';
import { cn } from '@/lib/utils';

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
