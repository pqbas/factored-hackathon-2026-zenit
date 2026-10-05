import { ChartColumn, Loader2, RefreshCw } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import useSWR from 'swr';

import { DailyTrend } from '@/components/metrics/daily-trend';
import { KpiCards } from '@/components/metrics/kpi-cards';
import { UseCaseBreakdown } from '@/components/metrics/use-case-breakdown';
import { Button } from '@/components/ui/button';
import { useLang } from '@/contexts/LangContext';
import {
  browserTimeZone,
  fetchMetrics,
  fillDays,
  metricsUrl,
  RANGES,
  rangeCaption,
  rangeDays,
  useCaseRows,
  type MetricsRange,
} from '@/lib/metrics';
import { cn } from '@/lib/utils';

function Notice({
  testId,
  icon,
  title,
  text,
  action,
}: {
  testId: string;
  icon: ReactNode;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
    >
      <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-lg tracking-tight">{title}</h2>
        <p className="max-w-sm text-muted-foreground text-sm">{text}</p>
      </div>
      {action}
    </div>
  );
}

// Resolution metrics for the admin (docs/flujo-atencion.md §6).
export default function MetricsPage() {
  const { t } = useLang();
  const [range, setRange] = useState<MetricsRange>('week');
  // The range is fixed per pick so the key stays stable across renders.
  const days = useMemo(() => rangeDays(range, new Date(), browserTimeZone()), [range]);
  const { data, error, isLoading, mutate } = useSWR(metricsUrl(days), fetchMetrics, {
    revalidateOnFocus: false,
  });

  let content: ReactNode;
  if (error) {
    content = (
      <Notice
        testId="metrics-error"
        icon={<RefreshCw className="size-5" />}
        title={t.metrics.errorTitle}
        text={t.metrics.errorText}
        action={
          <Button type="button" variant="secondary" onClick={() => mutate()}>
            {t.metrics.retry}
          </Button>
        }
      />
    );
  } else if (isLoading || !data) {
    content = (
      <Notice
        testId="metrics-loading"
        icon={<Loader2 className="size-5 animate-spin" />}
        title={t.metrics.loadingTitle}
        text={t.metrics.loadingText}
      />
    );
  } else if (data.total === 0) {
    content = (
      <Notice
        testId="metrics-empty"
        icon={<ChartColumn className="size-5" />}
        title={t.metrics.emptyTitle}
        text={t.metrics.emptyText}
      />
    );
  } else {
    content = (
      <>
        <KpiCards totals={data} />
        <div className="grid min-h-0 flex-1 gap-3.5 lg:grid-cols-[1fr_1.25fr]">
          <UseCaseBreakdown rows={useCaseRows(data)} />
          <DailyTrend days={fillDays(data.byDay, days.from, days.to)} />
        </div>
      </>
    );
  }

  return (
    <main className="m-2 ml-0 flex min-w-0 flex-1 flex-col gap-4.5 overflow-y-auto rounded-xl bg-background px-7 pt-5.5 pb-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-semibold text-xl tracking-tight">{t.metrics.title}</h1>
        <span data-testid="metrics-range-caption" className="text-muted-foreground text-sm">
          {rangeCaption(range, days.from, days.to)}
        </span>
        <div
          role="group"
          aria-label={t.metrics.rangeLabel}
          className="ml-auto flex gap-0.5 rounded-[9px] bg-secondary p-0.5"
        >
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              data-testid={`metrics-range-${r.id}`}
              aria-pressed={range === r.id}
              onClick={() => setRange(r.id)}
              className={cn(
                'h-7 rounded-[7px] px-3.5 font-medium text-[13px] transition-colors',
                range === r.id
                  ? 'bg-background text-foreground shadow-sm dark:bg-input'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {content}
    </main>
  );
}
