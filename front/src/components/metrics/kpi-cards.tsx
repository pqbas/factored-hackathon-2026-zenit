import { ASSISTANT_NAME } from '@/lib/assistant';
import { SERIES } from '@/components/metrics/series';
import { containmentPct, type Resolutions } from '@/lib/metrics';
import { cn } from '@/lib/utils';

const fmt = (n: number) => n.toLocaleString('es');

const CARDS: { key: keyof Omit<Resolutions, 'total'>; title: string; hint: string }[] = [
  { key: 'aiContained', title: 'Resueltas por la IA', hint: `${ASSISTANT_NAME} solo, sin asesor` },
  { key: 'human', title: 'Resueltas por un asesor', hint: 'El asesor apretó Resolver' },
  { key: 'assisted', title: 'Asistidas', hint: `Intervino un asesor y cerró ${ASSISTANT_NAME}` },
];

export function KpiCards({ totals }: { totals: Resolutions }) {
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
          Resuelto por la IA de punta a punta
        </span>
        <span data-testid="kpi-containment-value" className="font-semibold text-[44px] leading-none tracking-tighter">
          {containmentPct(totals)}%
        </span>
        <span className="text-muted-foreground text-xs">
          {fmt(totals.aiContained)} de {fmt(totals.total)} resoluciones
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
      {CARDS.map((card) => {
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
