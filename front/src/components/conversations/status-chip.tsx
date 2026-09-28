import type { AttentionTone } from '@/lib/advisor';
import { cn } from '@/lib/utils';

const ATTENTION_DOT: Record<AttentionTone, string> = {
  waiting: 'bg-tint-amber-foreground',
  mine: 'bg-primary',
  other: 'bg-tint-blue-foreground',
  resolved: 'bg-tint-green-foreground',
};

// Only shown when a chat needs attention or changed hands.
export function Attention({
  attention,
}: {
  attention: { text: string; tone: AttentionTone };
}) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 font-normal text-[11px] text-sidebar-foreground/70">
      <span className={cn('size-1.5 shrink-0 rounded-full', ATTENTION_DOT[attention.tone])} />
      <span data-testid="attention" className="whitespace-nowrap">
        {attention.text}
      </span>
    </span>
  );
}

// The use case the conversation is segmented by (e.g. "Consultas generales").
export function UseCaseTag({ label }: { label: string }) {
  return (
    <span
      data-testid="use-case-tag"
      className="min-w-0 truncate rounded-full bg-secondary px-2 py-px font-normal text-[10px] text-muted-foreground"
    >
      {label}
    </span>
  );
}
