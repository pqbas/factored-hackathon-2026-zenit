import { DAVID_VIEW_LABEL, type ReasonScope } from '@/lib/advisor';
import { cn } from '@/lib/utils';

// Inside a handoff reason: the handed-off chats or the ones David still
// handles with the same case.
export function ReasonScopeSwitch({
  scope,
  inboxCount,
  davidCount,
  onChange,
}: {
  scope: ReasonScope;
  inboxCount: number;
  // Undefined while the back doesn't count David's chats per case.
  davidCount: number | undefined;
  onChange: (scope: ReasonScope) => void;
}) {
  const options: { id: ReasonScope; label: string; count: number | undefined }[] = [
    { id: 'inbox', label: 'Bandeja', count: inboxCount },
    { id: 'david', label: DAVID_VIEW_LABEL, count: davidCount },
  ];
  return (
    <div role="tablist" aria-label="Mostrar" className="inline-flex rounded-lg bg-secondary p-0.5">
      {options.map((option) => {
        const active = option.id === scope;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={`scope-${option.id}`}
            onClick={() => onChange(option.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-[13px] transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm dark:bg-input'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span data-testid={`scope-${option.id}-count`} className="text-muted-foreground text-xs tabular-nums">
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
