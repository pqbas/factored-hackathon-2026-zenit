import { ArrowRight, Loader2, RefreshCw, UsersRound } from 'lucide-react';
import { useState } from 'react';
import useSWR from 'swr';
import { AnalyticsSourcePanel } from '@/components/analytics-source';
import { Panel, Stat } from '@/components/fraud/dashboard';
import { Button } from '@/components/ui/button';
import { useLang } from '@/contexts/LangContext';
import {
  fetchRetention,
  retentionCopy,
  type RetentionBand,
  type RetentionData,
} from '@/lib/retention';
import { cn } from '@/lib/utils';

export function RetentionOverview({ data }: { data: RetentionData }) {
  const { lang } = useLang();
  const c = retentionCopy(lang === 'pt');
  const n = (v: number) => v.toLocaleString(lang === 'pt' ? 'pt-BR' : 'es-PE');
  const pct = (v: number) =>
    new Intl.NumberFormat(lang === 'pt' ? 'pt-BR' : 'es-PE', {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(v);
  const totals = Object.fromEntries(data.bands.map((b) => [b.band, b.total]));
  const [country, setCountry] = useState('all');
  const [band, setBand] = useState('high');
  const [limit, setLimit] = useState(15);
  const customers = data.customers
    .filter(
      (r) =>
        (country === 'all' || r.country === country) &&
        (band === 'all' || r.band === band),
    )
    .sort(
      (a, b) =>
        b.families - a.families ||
        b.openCases - a.openCases ||
        a.ref.localeCompare(b.ref),
    );
  const colors = {
    high: 'bg-tint-amber text-tint-amber-fg',
    medium: 'bg-primary/10 text-primary',
    watch: 'bg-secondary text-muted-foreground',
    none: 'bg-secondary text-muted-foreground',
  };
  return (
    <div className="space-y-5" data-testid="retention-overview">
      <div className="grid gap-6 rounded-xl border border-border/70 bg-card/20 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={c.eligible}
          value={n(data.eligibleCustomers)}
          note={`${n(data.totalCustomers)} ${c.dataset}`}
          accent
        />
        <Stat label={c.high} value={n(totals.high ?? 0)} note={c.review} />
        <Stat label={c.medium} value={n(totals.medium ?? 0)} />
        <Stat label={c.watch} value={n(totals.watch ?? 0)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Panel title={c.bands} subtitle={c.ruleNote}>
          <div className="space-y-5">
            {(['high', 'medium', 'watch', 'none'] as RetentionBand[]).map(
              (id) => (
                <div key={id}>
                  <div className="mb-2 flex justify-between gap-3 text-sm">
                    <span>{c[id]}</span>
                    <span className="font-mono tabular-nums">
                      {n(totals[id] ?? 0)} ·{' '}
                      {pct(
                        data.eligibleCustomers
                          ? (totals[id] ?? 0) / data.eligibleCustomers
                          : 0,
                      )}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        id === 'high'
                          ? 'bg-chart-3/75'
                          : id === 'none'
                            ? 'bg-muted-foreground/40'
                            : 'bg-primary/75',
                      )}
                      style={{
                        width: `${data.eligibleCustomers ? ((totals[id] ?? 0) / data.eligibleCustomers) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ),
            )}
          </div>
        </Panel>
        <Panel title={c.signalsTitle}>
          <div className="space-y-4">
            {[...data.signals]
              .sort((a, b) => b.total - a.total)
              .map((s) => (
                <div
                  key={s.id}
                  className="flex justify-between gap-4 border-b border-border/60 pb-3 text-sm last:border-0"
                >
                  <span className="text-muted-foreground">
                    {c.ruleLabels[s.id as keyof typeof c.ruleLabels] ?? s.id}
                  </span>
                  <span className="font-mono tabular-nums">{n(s.total)}</span>
                </div>
              ))}
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            {c.unknown}: {n(data.activityUnknown)}
          </p>
        </Panel>
      </div>
      <Panel title={c.countries}>
        <div className="grid gap-3 sm:grid-cols-3">
          {data.countries.map((r) => (
            <button
              type="button"
              key={r.country}
              onClick={() => {
                setCountry(r.country);
                setLimit(15);
              }}
              aria-pressed={country === r.country}
              className={cn(
                'rounded-lg border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                country === r.country
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border/70 bg-secondary/30 hover:bg-secondary/60',
              )}
            >
              <span className="text-sm font-medium">{r.country}</span>
              <span className="mt-2 block font-mono text-2xl tabular-nums">
                {n(r.total)}
              </span>
              <span className="mt-2 block text-sm text-muted-foreground">
                {n(r.high)} {c.high.toLowerCase()}
              </span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title={c.shortlist} subtitle={c.bounded}>
        <div className="mb-5 space-y-3">
          <div
            role="group"
            aria-label={c.country}
            className="flex flex-wrap gap-2"
          >
            <span className="flex items-center pr-2 text-sm text-muted-foreground">
              {c.country}
            </span>
            {['all', ...data.countries.map((r) => r.country)].map((id) => (
              <button
                type="button"
                key={id}
                aria-pressed={country === id}
                onClick={() => {
                  setCountry(id);
                  setLimit(15);
                }}
                className={cn(
                  'min-h-11 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring',
                  country === id
                    ? 'bg-primary/10 text-primary'
                    : 'bg-secondary text-muted-foreground',
                )}
              >
                {id === 'all' ? c.all : id}
              </button>
            ))}
          </div>
          <div
            role="group"
            aria-label={c.priority}
            className="flex flex-wrap gap-2"
          >
            <span className="flex items-center pr-2 text-sm text-muted-foreground">
              {c.priority}
            </span>
            {['high', 'medium', 'watch', 'all'].map((id) => (
              <button
                type="button"
                key={id}
                aria-pressed={band === id}
                onClick={() => {
                  setBand(id);
                  setLimit(15);
                }}
                className={cn(
                  'min-h-11 rounded-lg px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring',
                  band === id
                    ? 'bg-primary/10 text-primary'
                    : 'bg-secondary text-muted-foreground',
                )}
              >
                {id === 'all' ? c.all : c[id as 'high' | 'medium' | 'watch']}
              </button>
            ))}
          </div>
        </div>
        {customers.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {c.empty}
          </p>
        ) : (
          <div className="space-y-3">
            {customers.slice(0, limit).map((r) => (
              <details
                key={r.ref}
                className="rounded-lg border border-border/70 bg-secondary/20"
              >
                <summary className="cursor-pointer rounded-lg p-4 focus-visible:outline-2 focus-visible:outline-ring">
                  <span className="ml-2 inline-flex flex-wrap items-center gap-x-4 gap-y-2">
                    <span className="font-mono text-sm">
                      {c.customer} · {r.ref}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {r.country} · {r.segment}
                    </span>
                    <span
                      className={cn(
                        'rounded-md px-2 py-1 text-sm',
                        colors[r.band],
                      )}
                    >
                      {c[r.band]}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {r.signals
                        .map(
                          (s) =>
                            c.ruleLabels[s as keyof typeof c.ruleLabels] ?? s,
                        )
                        .join(' · ')}
                    </span>
                  </span>
                </summary>
                <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    [c.days, r.inactiveDays ?? '—'],
                    [c.activity, `${r.txPrevious30} → ${r.tx30}`],
                    [c.cases, r.openCases],
                    [
                      c.csat,
                      r.csat === null
                        ? '—'
                        : `${r.csat.toFixed(2)} · ${r.csatResponses} ${c.answers}`,
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="text-sm text-muted-foreground">{label}</p>
                      <p className="mt-1 font-mono text-lg">{value}</p>
                    </div>
                  ))}
                </div>
              </details>
            ))}
            {customers.length > limit && (
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={() => setLimit((v) => v + 15)}
              >
                {lang === 'pt' ? 'Ver mais' : 'Ver más'}
                <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        )}
      </Panel>
      <Panel title={`${c.asOf}: ${data.asOf}`} subtitle={c.dateNote}>
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
          {c.action}
        </p>
        <p className="mt-3 font-mono text-sm text-muted-foreground">
          {data.ruleVersion}
        </p>
      </Panel>
    </div>
  );
}

export default function RetentionPage() {
  const { lang } = useLang();
  const c = retentionCopy(lang === 'pt');
  const [refreshError, setRefreshError] = useState(false);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    '/api/advisor/retention-dashboard',
    fetchRetention,
    {
      revalidateOnFocus: false,
      onSuccess: () => setRefreshError(false),
      refreshInterval: (r) => (r?.source?.updating ? 2500 : 60000),
    },
  );
  return (
    <main
      data-testid="retention-dashboard"
      className="m-2 ml-0 min-w-0 flex-1 overflow-y-auto rounded-xl bg-background px-4 py-5 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-[1440px] space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <UsersRound className="size-4 text-primary" />
              Zenit / {lang === 'pt' ? 'Administração' : 'Administración'}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {c.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">{c.subtitle}</p>
            <span className="mt-3 inline-block rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
              {c.rules}
            </span>
          </div>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={isValidating}
            onClick={() => {
              setRefreshError(false);
              void mutate(
                fetchRetention('/api/advisor/retention-dashboard?refresh=1'),
                { revalidate: false },
              ).catch(() => setRefreshError(true));
            }}
          >
            <RefreshCw
              className={cn('size-4', isValidating && 'animate-spin')}
            />
            {c.refresh}
          </Button>
        </header>
        {data && <AnalyticsSourcePanel source={data.source} />}
        {(error || refreshError) && data && (
          <p role="status" className="text-sm text-tint-amber-fg">
            {lang === 'pt'
              ? 'A atualização da tela falhou; mostrando o último resultado recebido.'
              : 'Falló la actualización de la pantalla; se muestra el último resultado recibido.'}
          </p>
        )}
        {error && !data ? (
          <div
            role="alert"
            className="flex min-h-64 flex-col items-center justify-center gap-4"
          >
            <p>{c.error}</p>
            <Button onClick={() => mutate()}>{c.retry}</Button>
          </div>
        ) : isLoading || !data || (!data.data && data.source.updating) ? (
          <div
            role="status"
            className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground"
          >
            <Loader2 className="size-5 animate-spin" />
            {c.loading}
          </div>
        ) : data.data ? (
          <RetentionOverview data={data.data} />
        ) : (
          <p className="rounded-xl border border-border p-6 text-sm text-muted-foreground">
            {lang === 'pt'
              ? 'Não há um resultado disponível. Verifique a conexão e tente atualizar.'
              : 'No hay un resultado disponible. Revisa la conexión e intenta actualizar.'}
          </p>
        )}
      </div>
    </main>
  );
}
