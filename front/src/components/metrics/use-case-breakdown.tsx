import { UseCaseChip, useCaseStyle } from '@/components/conversations/use-case-style';
import { useLang } from '@/contexts/LangContext';
import { intlLocale } from '@/lib/i18n';
import { containmentPct, type UseCaseRow } from '@/lib/metrics';
import { cn } from '@/lib/utils';

// One bar per use case, in the console's colors: its length is the case's
// closures, the solid part the ones David closed on his own.
export function UseCaseBreakdown({ rows }: { rows: UseCaseRow[] }) {
  const { t } = useLang();
  const max = Math.max(1, ...rows.map((r) => r.total));

  return (
    <section className="flex min-h-0 flex-col gap-3.5 rounded-2xl bg-secondary/50 px-5 py-4.5">
      <div className="flex items-baseline gap-2.5">
        <h2 className="font-semibold text-[15px]">{t.metrics.byUseCase}</h2>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2 w-2.5 rounded-xs bg-muted-foreground" />
          {t.metrics.byAi}
          <span className="ml-1.5 h-2 w-2.5 rounded-xs bg-muted-foreground/30" />
          {t.metrics.withAdvisor}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const total = (row.total / max) * 100;
          const ai = (row.aiContained / max) * 100;
          const fill = useCaseStyle(row.id).bar;
          return (
            <div
              key={row.id}
              data-testid={`metrics-use-case-${row.id}`}
              className="grid grid-cols-[9.25rem_minmax(0,1fr)_2.75rem_3.25rem] items-center gap-3"
            >
              <span className="justify-self-start">
                <UseCaseChip id={row.id} />
              </span>
              <svg
                aria-hidden="true"
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
                className="h-2.5 w-full overflow-hidden rounded-full fill-secondary"
              >
                <rect width="100" height="10" />
                <rect width={total} height="10" className={cn(fill, 'opacity-30')} />
                <rect width={ai} height="10" className={fill} />
              </svg>
              <span data-testid="use-case-total" className="text-right font-semibold text-[13px]">
                {row.total.toLocaleString(intlLocale())}
              </span>
              <span data-testid="use-case-pct" className="text-right text-muted-foreground text-xs">
                {containmentPct(row)}%
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-auto text-[11px] text-muted-foreground">
        {t.metrics.barNote}
      </p>
    </section>
  );
}
