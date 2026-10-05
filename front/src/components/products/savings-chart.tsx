import useSWR from 'swr';

import { useLang } from '@/contexts/LangContext';
import {
  fetchSavingsHistory,
  formatMoney,
  type Product,
  type SavingsSeries,
  savingsWithoutSeries,
} from '@/lib/products';

// Chart units: the SVG scales to the card's width and keeps its proportions.
const WIDTH = 600;
const HEIGHT = 140;
const PAD = 8;

function monthName(month: string, months: string[]): string {
  const index = Number(month.slice(5, 7)) - 1;
  const name = months[index] ?? month;
  return name.charAt(0).toUpperCase() + name.slice(1, 3);
}

function SeriesChart({ series }: { series: SavingsSeries }) {
  const { t } = useLang();
  const money = (amount: number) => formatMoney(amount, series.currency);
  const values = series.points.map((p) => p.balance);
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const step = series.points.length > 1 ? (WIDTH - PAD * 2) / (series.points.length - 1) : 0;
  const xy = series.points.map((p, i) => ({
    ...p,
    x: PAD + i * step,
    y: PAD + (1 - (p.balance - min) / span) * (HEIGHT - PAD * 2),
  }));
  const line = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area = `${line} L${xy[xy.length - 1].x},${HEIGHT} L${xy[0].x},${HEIGHT} Z`;
  const last = xy.length - 1;

  return (
    <div data-testid={`savings-chart-${series.currency}`} className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-2xl tabular-nums tracking-tight">{money(series.current)}</span>
        <span className="text-muted-foreground text-xs">
          {series.currency} · {t.products.savingsToday}
        </span>
      </div>
      <div className="flex gap-3">
        <svg
          role="img"
          aria-label={t.products.savingsChart(series.currency)}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-auto min-w-0 flex-1 overflow-visible"
        >
          <path d={area} className="fill-primary/10" />
          <path
            d={line}
            className="fill-none stroke-primary"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {xy.map((p, i) => (
            <g key={p.month} data-testid={`savings-point-${p.month}`}>
              <title>{`${monthName(p.month, t.metrics.months)} ${p.month.slice(0, 4)}: ${money(p.balance)}`}</title>
              {/* A wide invisible target so the tooltip is easy to hit. */}
              <circle cx={p.x} cy={p.y} r={14} className="fill-transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={i === last ? 6 : 3.5}
                className={i === last ? 'fill-primary stroke-background' : 'fill-background stroke-primary'}
                strokeWidth={2}
              />
            </g>
          ))}
        </svg>
        <div className="flex w-20 shrink-0 flex-col justify-between py-1 text-right text-[11px] text-muted-foreground tabular-nums">
          <span>{money(max)}</span>
          <span>{money(min)}</span>
        </div>
      </div>
      <div className="mr-23 flex justify-between text-[11px] text-muted-foreground">
        {series.points.map((p, i) => (
          <span key={p.month} className={i % 2 === 1 && i !== last ? 'hidden sm:inline' : undefined}>
            {monthName(p.month, t.metrics.months)}
          </span>
        ))}
      </div>
    </div>
  );
}

// "Evolución de tus ahorros": one line per currency (their scales differ too
// much to share an axis). An estimate: only today's point is real.
export function SavingsChart({
  sessionToken,
  products,
}: {
  sessionToken: string;
  products: Product[];
}) {
  const { t } = useLang();
  const { data: series } = useSWR(
    ['savings-history', sessionToken],
    ([, token]: [string, string]) => fetchSavingsHistory(token),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  // Nothing to show until it loads, and nothing (not an error) if it fails.
  if (!series) return null;
  const withoutSeries = savingsWithoutSeries(products, series);
  if (series.length === 0 && withoutSeries.length === 0) return null;

  return (
    <section
      data-testid="savings-evolution"
      className="flex flex-col gap-4 rounded-2xl bg-secondary/50 px-5 py-4.5"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="font-semibold text-[15px]">{t.products.savingsTitle}</h2>
        <span data-testid="savings-estimated" className="text-muted-foreground text-xs">
          {t.products.savingsEstimated}
        </span>
      </div>
      {series.map((s) => (
        <SeriesChart key={s.currency} series={s} />
      ))}
      {withoutSeries.map((s) => (
        <div key={s.currency} data-testid={`savings-current-${s.currency}`} className="flex flex-col gap-0.5">
          <span className="font-semibold text-2xl tabular-nums tracking-tight">
            {formatMoney(s.current, s.currency)}
          </span>
          <span className="text-muted-foreground text-xs">{t.products.savingsNoSeries}</span>
        </div>
      ))}
    </section>
  );
}
