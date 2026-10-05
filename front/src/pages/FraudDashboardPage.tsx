import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import useSWR from 'swr';

import {
  DataOverview,
  EvidenceFooter,
  ModelOverview,
  OperationOverview,
} from '@/components/fraud/dashboard';
import { Button } from '@/components/ui/button';
import { useLang } from '@/contexts/LangContext';
import { fraudCopy } from '@/lib/fraud-copy';
import { fetchFraudDashboard, fraudDashboardUrl } from '@/lib/fraud-dashboard';
import { browserTimeZone, rangeDays, type MetricsRange } from '@/lib/metrics';
import { cn } from '@/lib/utils';
import { AnalyticsSourcePanel } from '@/components/analytics-source';

export default function FraudDashboardPage() {
  const { lang } = useLang();
  const c = fraudCopy(lang);
  const [tab, setTab] = useState<'overview' | 'operations' | 'model'>(
    'overview',
  );
  const [range, setRange] = useState<MetricsRange>('month');
  const [asOf, setAsOf] = useState(() => new Date());
  const [refreshError, setRefreshError] = useState(false);
  const window = useMemo(
    () => rangeDays(range, asOf, browserTimeZone()),
    [range, asOf],
  );
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    fraudDashboardUrl(window),
    fetchFraudDashboard,
    {
      revalidateOnFocus: false,
      refreshInterval: data => data?.source?.updating || data?.operational?.cache?.updating ? 2500 : 60000,
      keepPreviousData: false,
      onSuccess: () => setRefreshError(false),
    },
  );
  const refresh = () => {
    setAsOf(new Date());
    setRefreshError(false);
    void mutate(fetchFraudDashboard(`${fraudDashboardUrl(window)}&refresh=1`), { revalidate: false }).catch(() => setRefreshError(true));
  };

  return (
    <main
      data-testid="fraud-dashboard"
      className="m-2 ml-0 min-w-0 flex-1 overflow-y-auto rounded-xl bg-background px-4 py-5 sm:px-6 lg:px-8"
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 text-primary" />
              Zenit / {lang === 'pt' ? 'Administração' : 'Administración'}
              <span className="ml-1 rounded-full bg-tint-amber px-2.5 py-1 text-tint-amber-fg">
                {c.experimental}
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {c.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{c.subtitle}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={isValidating}
            onClick={refresh}
          >
            <RefreshCw
              className={cn('size-4', isValidating && 'animate-spin')}
            />
            {isValidating ? c.refreshing : c.refresh}
          </Button>
        </header>
        {data && <AnalyticsSourcePanel source={data.source} fallback={!data.source?.statementId} />}
        {(error || refreshError) && data && <p role="status" className="text-sm text-tint-amber-fg">{lang === 'pt' ? 'A atualização da tela falhou; mostrando o último resultado recebido.' : 'Falló la actualización de la pantalla; se muestra el último resultado recibido.'}</p>}
        {data?.snapshot.dataset.scope === 'training_validation' && <p className="text-sm text-muted-foreground">{lang === 'pt' ? 'Panorama consultado no Databricks: treinamento e validação até 2025-12-31. O teste final de 2026 permanece separado.' : 'Panorama consultado en Databricks: entrenamiento y validación hasta 2025-12-31. El test final de 2026 permanece separado.'}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border">
          <div
            role="group"
            aria-label={c.title}
            className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:gap-x-5"
          >
            {(['overview', 'operations', 'model'] as const).map((id) => (
              <button
                type="button"
                key={id}
                data-testid={`fraud-tab-${id}`}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  'min-h-12 border-b-2 px-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                  tab === id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {c[id]}
              </button>
            ))}
          </div>
          {data && (
            <p className="pb-2 text-sm text-muted-foreground">
              {tab === 'operations'
                ? `${data.window.from} → ${data.window.to} · ${data.window.tz}`
                : tab === 'model'
                  ? `${c.validation} · ${data.snapshot.model.validationFrom} → ${data.snapshot.model.validationTo}`
                  : `${c.snapshot} · ${data.snapshot.dataset.profiledAt}`}
            </p>
          )}
        </div>
        {tab === 'operations' && (
          <div
            role="group"
            aria-label={c.period}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="mr-2 text-sm text-muted-foreground">
              {c.period}
            </span>
            {(['today', 'week', 'month'] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={range === id}
                onClick={() => {
                  setAsOf(new Date());
                  setRange(id);
                }}
                className={cn(
                  'min-h-11 rounded-lg px-4 text-sm focus-visible:outline-2 focus-visible:outline-ring',
                  range === id
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'bg-secondary text-muted-foreground hover:text-foreground',
                )}
              >
                {c[id]}
              </button>
            ))}
          </div>
        )}
        {error && !data ? (
          <div
            role="alert"
            className="flex min-h-64 flex-col items-center justify-center gap-4 text-center"
          >
            <p>{c.error}</p>
            <Button onClick={refresh}>{c.retry}</Button>
          </div>
        ) : isLoading || !data ? (
          <div
            role="status"
            className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground"
          >
            <Loader2 className="size-5 animate-spin" />
            {c.loading}
          </div>
        ) : (
          <>
            {tab === 'overview' && <DataOverview snapshot={data.snapshot} />}
            {tab === 'operations' && (
              <OperationOverview
                operational={data.operational}
                from={data.window.from}
                to={data.window.to}
              />
            )}
            {tab === 'model' && <ModelOverview snapshot={data.snapshot} />}
            <EvidenceFooter snapshot={data.snapshot} />
            <footer className="pb-2 text-sm text-muted-foreground">
              {c.published}: {data.snapshot.publishedAt} · {c.refresh}:{' '}
              {new Date(data.refreshedAt).toLocaleTimeString(
                lang === 'pt' ? 'pt-BR' : 'es-PE',
              )}
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
