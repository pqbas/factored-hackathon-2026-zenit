import { ChevronDown, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import { ASSISTANT_NAME } from '@/lib/assistant';
import { type AgentHandoff, caseFields, handoffReasonLabel } from '@/lib/handoff-case';
import { cn } from '@/lib/utils';

// The case David handed off: reason, summary and the data he verified against
// the bank, as a record card. Values are shown as they come.
export function HandoffCard({
  handoff,
  defaultOpen = true,
  className,
}: {
  handoff: AgentHandoff;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const fields = caseFields(handoff);
  const closed = !!handoff.resolvedAt;

  return (
    <section
      data-testid="handoff-card"
      className={cn('rounded-xl border border-border bg-card/60 text-sm', className)}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-start gap-2 px-3.5 py-2.5 text-left"
      >
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.9} />
        {/* Title on its own line and the tags below, so it fits the side panel. */}
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span className="font-semibold text-[13px]">Caso derivado por {ASSISTANT_NAME}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <span
              data-testid="handoff-reason"
              className="rounded-md bg-primary/15 px-2 py-0.5 font-medium text-[11px] text-primary"
            >
              {handoffReasonLabel(handoff.reason)}
            </span>
            {closed && (
              <span className="rounded-md bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                Cerrado
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          className={cn('mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-2.5 border-border border-t px-3.5 pt-2.5 pb-3">
          {handoff.summary && (
            <p data-testid="handoff-summary" className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">
              {handoff.summary}
            </p>
          )}
          {fields.length > 0 && (
            <dl
              data-testid="handoff-facts"
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-lg bg-secondary/60 px-3 py-2.5 text-xs"
            >
              {fields.map((field) => (
                <div key={field.key} className="contents">
                  <dt className="text-muted-foreground">{field.label}</dt>
                  <dd data-testid={`handoff-fact-${field.key}`} className="min-w-0 whitespace-pre-wrap break-words">
                    {field.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {!handoff.summary && fields.length === 0 && (
            <p className="text-muted-foreground text-xs">Sin datos verificados.</p>
          )}
        </div>
      )}
    </section>
  );
}
