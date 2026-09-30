import { useLang } from '@/contexts/LangContext';
import { SERIES } from '@/components/metrics/series';
import { intlLocale } from '@/lib/i18n';
import { containmentPct, type Resolutions } from '@/lib/metrics';
import { cn } from '@/lib/utils';

const fmt = (n: number) => n.toLocaleString(intlLocale());

export function KpiCards({ totals }: { totals: Resolutions }) {
  const { t } = useLang();
  const cards: { key: keyof Omit<Resolutions, 'total'>; title: string; hint: string }[] = [
    { key: 'aiContained', title: t.metrics.kpiAiTitle, hint: t.metrics.kpiAiHint },
    { key: 'human', title: t.metrics.kpiHumanTitle, hint: t.metrics.kpiHumanHint },
    { key: 'assisted', title: t.metrics.kpiAssistedTitle, hint: t.metrics.kpiAssistedHint },
  ];
  // Split bar under the headline: IA, assisted and advisor, left to right.
  let x = 0;
  const segments = SERIES.map((s) => {
    const width = totals.total ? (totals[s.key] / totals.total) * 100 : 0;
    const segment = { ...s, x, width };
    x += width;
    return segment;
  });

  return (
    <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-[1.35fr_1fr_1fr_1fr]">
      <div
        data-testid="kpi-containment"
        className="col-span-2 flex flex-col gap-2 rounded-2xl bg-primary/15 px-5 py-4.5 lg:col-span-1"
      >
        <span className="font-semibold text-primary text-xs">
          {t.metrics.containment}
        </span>
        <span data-testid="kpi-containment-value" className="font-semibold text-[44px] leading-none tracking-tighter">
          {containmentPct(totals)}%
        </span>
        <span className="text-muted-foreground text-xs">
          {t.metrics.ofResolutions(fmt(totals.aiContained), fmt(totals.total))}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 100 6"
          preserveAspectRatio="none"
          className="mt-1 h-1.5 w-full overflow-hidden rounded-full fill-secondary"
        >
          <rect width="100" height="6" />
          {segments.map((s) => (
            <rect key={s.key} x={s.x} width={s.width} height="6" className={s.fill} />
          ))}
        </svg>
      </div>
      {cards.map((card) => {
        const series = SERIES.find((s) => s.key === card.key);
        return (
          <div
            key={card.key}
            data-testid={`kpi-${card.key}`}
            className="flex flex-col gap-2 rounded-2xl bg-secondary/50 px-5 py-4.5"
          >
            <span className="flex items-center gap-2 font-semibold text-muted-foreground text-xs">
              <span className={cn('size-2 rounded-full', series?.dot)} />
              {card.title}
            </span>
            <span
              data-testid={`kpi-${card.key}-value`}
              className="font-semibold text-[32px] leading-tight tracking-tight"
            >
              {fmt(totals[card.key])}
            </span>
            <span className="text-muted-foreground text-xs">{card.hint}</span>
          </div>
        );
      })}
    </div>
  );
}
