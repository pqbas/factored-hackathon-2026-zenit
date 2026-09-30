import { useLang } from '@/contexts/LangContext';
import { SERIES } from '@/components/metrics/series';
import { dayLabel, type DayResolutions } from '@/lib/metrics';
import { cn } from '@/lib/utils';

// Each day takes 10 units of the chart; the bar leaves a gap on both sides.
const SLOT = 10;
const HEIGHT = 100;

// Stacked bars per day: IA at the bottom, then assisted, then advisor.
export function DailyTrend({ days }: { days: DayResolutions[] }) {
  const { t } = useLang();
  const single = days.length <= 1;
  const long = days.length <= 7;
  const peak = Math.max(1, ...days.map((d) => d.total));
  const gap = long ? 2.2 : 1;

  return (
    <section className="flex min-h-0 flex-col gap-3.5 rounded-2xl bg-secondary/50 px-5 py-4.5">
      <div className="flex items-baseline gap-3.5">
        <h2 className="font-semibold text-[15px]">{t.metrics.trendTitle}</h2>
        <div className="ml-auto flex items-center gap-3.5">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn('size-2 rounded-xs', s.dot)} />
              {s.label}
            </span>
          ))}
        </div>
      </div>
      {single ? (
        <p
          data-testid="metrics-trend-single"
          className="flex min-h-48 flex-1 items-center justify-center text-center text-muted-foreground text-sm"
        >
          {t.metrics.trendSingle1}
          <br />
          {t.metrics.trendSingle2}
        </p>
      ) : (
        <div className="flex min-h-48 flex-1 flex-col gap-2">
          <svg
            role="img"
            aria-label={t.metrics.trendChart}
            viewBox={`0 0 ${days.length * SLOT} ${HEIGHT}`}
            preserveAspectRatio="none"
            className="w-full flex-1 border-border border-b"
          >
            {days.map((d, i) => {
              let y = HEIGHT;
              return (
                <g key={d.day} data-testid={`metrics-day-${d.day}`}>
                  <title>
                    {t.metrics.dayTitle(dayLabel(d.day, true), d.aiContained, d.assisted, d.human)}
                  </title>
                  {SERIES.map((s) => {
                    const h = (d[s.key] / peak) * (HEIGHT - 4);
                    y -= h;
                    return (
                      <rect
                        key={s.key}
                        x={i * SLOT + gap}
                        y={y}
                        width={SLOT - gap * 2}
                        height={h}
                        className={s.fill}
                      />
                    );
                  })}
                </g>
              );
            })}
          </svg>
          <div className="flex">
            {days.map((d, i) => (
              <span
                key={d.day}
                className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11px] text-muted-foreground"
              >
                {/* A month shows every fifth day so labels don't collide. */}
                {long || i === 0 || i % 5 === 4 ? dayLabel(d.day, long) : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
