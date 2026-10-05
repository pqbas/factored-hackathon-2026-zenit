import {
  ArrowRight,
  Database,
  Fingerprint,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { useLang } from '@/contexts/LangContext';
import { fraudCopy } from '@/lib/fraud-copy';
import {
  fraction,
  type FraudSnapshot,
  type FraudOperational,
  type FraudSegment,
} from '@/lib/fraud-dashboard';
import { cn } from '@/lib/utils';

// Intent: a bank administrator inspects activity, coverage and evidence before
// opening a human case. Existing graphite surfaces, blue activity and amber
// uncertainty keep this part of Zenit. Border-led panels, SF system typography,
// tabular monospace numbers and a four-pixel spacing scale follow the app.
function useFormat() {
  const { lang } = useLang();
  const locale = lang === 'pt' ? 'pt-BR' : 'es-PE';
  return {
    n: (v: number) => new Intl.NumberFormat(locale).format(v),
    compact: (v: number) =>
      new Intl.NumberFormat(locale, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(v),
    pct: (v: number | null, digits = 2) =>
      v === null
        ? '—'
        : new Intl.NumberFormat(locale, {
            style: 'percent',
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
          }).format(v),
    month: (v: string) =>
      new Intl.DateTimeFormat(locale, {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      }).format(new Date(`${v.slice(0, 7)}-01T00:00:00Z`)),
  };
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'min-w-0 rounded-xl border border-border/70 bg-card/30 p-4 sm:p-5',
        className,
      )}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          {subtitle && (
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  note,
  accent = false,
}: { label: string; value: string; note?: string; accent?: boolean }) {
  return (
    <div className="min-w-0 border-l-2 border-border pl-4 first:border-primary">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-2 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl',
          accent && 'text-primary',
        )}
      >
        {value}
      </p>
      {note && (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}

function Toggle({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-secondary p-1"
    >
      {options.map((o) => (
        <button
          type="button"
          key={o.id}
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            'min-h-11 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring',
            value === o.id
              ? 'bg-background text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Ledger({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            {headers.map((h, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-3 py-3 font-medium first:pl-0"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {r.map((v, j) => (
                <td key={j} className="whitespace-nowrap px-3 py-3 first:pl-0">
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyActivity({ snapshot }: { snapshot: FraudSnapshot }) {
  const { lang } = useLang();
  const c = fraudCopy(lang);
  const f = useFormat();
  const rows = snapshot.dataset.monthly;
  const [index, setIndex] = useState(rows.length - 1);
  const row = rows[index];
  const peak = Math.max(1, ...rows.map((r) => r.total));
  const ratePeak = Math.max(0.0001, ...rows.map((r) => r.fraud / r.total));
  const slot = 800 / rows.length;
  const points = rows
    .map(
      (r, i) =>
        `${50 + i * slot + slot / 2},${185 - (r.fraud / r.total / ratePeak) * 150}`,
    )
    .join(' ');
  return (
    <Panel
      title={c.trend}
      subtitle={c.trendNote}
      action={
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary" />
            {c.volume}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-4 bg-chart-3" />
            {c.rate} · %
          </span>
        </div>
      }
    >
      <div
        className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg bg-secondary/50 px-4 py-3"
        aria-live="polite"
      >
        <span className="text-sm text-muted-foreground">
          {c.selected}:{' '}
          <strong className="font-medium text-foreground">
            {f.month(row.month)}
          </strong>
        </span>
        <span className="font-mono text-sm tabular-nums">
          {f.n(row.total)}{' '}
          <span className="font-sans text-muted-foreground">
            {c.transactions}
          </span>
        </span>
        <span className="font-mono text-sm tabular-nums text-tint-amber-fg">
          {f.pct(fraction(row.fraud, row.total), 3)}{' '}
          <span className="font-sans">
            · {f.n(row.fraud)} {c.labelCount.toLowerCase()}
          </span>
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 900 235"
          role="img"
          aria-label={`${c.trend}: ${c.volume}, ${c.rate}`}
          className="w-full min-w-[700px]"
        >
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <line
                x1="50"
                x2="850"
                y1={185 - i * 50}
                y2={185 - i * 50}
                className="stroke-border"
                strokeDasharray="3 5"
              />
              <text
                x="25"
                y={189 - i * 50}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {f.compact((peak * i) / 3)}
              </text>
              <text
                x="875"
                y={189 - i * 50}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {f.pct((ratePeak * i) / 3, 2)}
              </text>
            </g>
          ))}
          {rows.map((r, i) => (
            <g
              key={r.month}
              className="cursor-pointer focus:outline-none"
              role="button"
              tabIndex={0}
              aria-label={`${f.month(r.month)}, ${f.n(r.total)}, ${f.pct(r.fraud / r.total, 3)}`}
              onClick={() => setIndex(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIndex(i);
                }
              }}
              onMouseEnter={() => setIndex(i)}
              onFocus={() => setIndex(i)}
            >
              <title>{`${r.month}: ${f.n(r.total)} · ${f.n(r.fraud)} · ${f.pct(r.fraud / r.total, 3)}`}</title>
              <rect
                x={50 + i * slot + 2}
                y={185 - (r.total / peak) * 150}
                width={Math.max(2, slot - 4)}
                height={(r.total / peak) * 150}
                rx="2"
                className={cn(
                  'fill-primary transition-opacity',
                  i === index ? 'opacity-100' : 'opacity-35 hover:opacity-75',
                )}
              />
              {(i % 6 === 1 || i === rows.length - 1) && (
                <text
                  x={50 + i * slot + slot / 2}
                  y="211"
                  textAnchor="middle"
                  className="fill-muted-foreground text-[12px]"
                >
                  {f.month(r.month)}
                </text>
              )}
            </g>
          ))}
          <polyline
            points={points}
            fill="none"
            className="pointer-events-none stroke-chart-3"
            strokeWidth="2"
          />
          <circle
            cx={50 + index * slot + slot / 2}
            cy={185 - (row.fraud / row.total / ratePeak) * 150}
            r="4"
            className="pointer-events-none fill-chart-3"
          />
        </svg>
      </div>
      <details className="mt-3 text-sm">
        <summary className="w-fit cursor-pointer rounded-md py-3 text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
          {c.details}
        </summary>
        <Ledger
          headers={[c.selected, c.volume, c.labelCount, c.rate]}
          rows={rows.map((r) => [
            r.month,
            f.n(r.total),
            f.n(r.fraud),
            f.pct(r.fraud / r.total, 3),
          ])}
        />
      </details>
    </Panel>
  );
}

function SegmentAnalysis({ snapshot }: { snapshot: FraudSnapshot }) {
  const { lang } = useLang();
  const c = fraudCopy(lang);
  const f = useFormat();
  const [dimension, setDimension] = useState('countries');
  const [mode, setMode] = useState('volume');
  const items: FraudSegment[] =
    snapshot.dataset[dimension as 'countries' | 'channels' | 'types'];
  const rows = [...items].sort((a, b) =>
    mode === 'volume'
      ? b.total - a.total
      : b.fraud / b.total - a.fraud / a.total,
  );
  const value = (r: FraudSegment) =>
    mode === 'volume' ? r.total : r.fraud / r.total;
  const peak = Math.max(0.000001, ...rows.map(value));
  return (
    <Panel title={c.segments} subtitle={c.segmentNote}>
      <div className="mb-6 flex flex-wrap justify-between gap-3">
        <Toggle
          label={c.segments}
          options={[
            { id: 'countries', label: c.country },
            { id: 'channels', label: c.channel },
            { id: 'types', label: c.type },
          ]}
          value={dimension}
          onChange={setDimension}
        />
        <Toggle
          label={c.count}
          options={[
            { id: 'volume', label: c.volume },
            { id: 'rate', label: c.rate },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>
      <div className="space-y-5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{r.label}</span>
              <span className="text-right font-mono text-sm tabular-nums">
                {mode === 'volume' ? f.n(r.total) : f.pct(r.fraud / r.total, 3)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                style={{ width: `${(value(r) / peak) * 100}%` }}
                className={cn(
                  'h-full rounded-full transition-all duration-200',
                  mode === 'volume' ? 'bg-primary/80' : 'bg-chart-3/80',
                )}
              />
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {f.n(r.fraud)} {c.labelCount.toLowerCase()} ·{' '}
              {f.pct(r.total / snapshot.dataset.total, 1)}{' '}
              {c.volume.toLowerCase()}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export function DataOverview({ snapshot }: { snapshot: FraudSnapshot }) {
  const { lang } = useLang();
  const c = fraudCopy(lang);
  const f = useFormat();
  const d = snapshot.dataset;
  const leader = d.countries.reduce((a, b) => (b.total > a.total ? b : a));
  const quality = Object.fromEntries(d.quality.map((q) => [q.id, q]));
  return (
    <div className="space-y-5" data-testid="fraud-overview">
      <div className="grid grid-cols-1 gap-6 rounded-xl border border-border/70 bg-card/20 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={c.total}
          value={f.n(d.total)}
          note={`${d.dateRange.min_date.slice(0, 10)} → ${d.dateRange.max_date.slice(0, 10)}`}
          accent
        />
        <Stat label={c.labels} value={f.n(d.fraud)} note={c.labelNote} />
        <Stat
          label={c.prevalence}
          value={f.pct(d.fraud / d.total, 4)}
          note={`${c.ratioNote} ${f.n(Math.round(d.total / d.fraud))} ${c.transactions}.`}
        />
        <Stat
          label={c.cleanIds}
          value={f.pct((d.total - d.nullIds - d.duplicates) / d.total, 0)}
          note={
            lang === 'pt'
              ? `${f.n(d.duplicates)} duplicados · ${f.n(d.nullIds)} IDs nulos`
              : `${f.n(d.duplicates)} duplicados · ${f.n(d.nullIds)} IDs nulos`
          }
        />
      </div>
      <MonthlyActivity snapshot={snapshot} />
      <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
        <SegmentAnalysis snapshot={snapshot} />
        <div className="space-y-5">
          <Panel title={c.quality} subtitle={c.qualityNote}>
            <div className="space-y-5">
              {d.quality.map((q) => (
                <div key={q.id}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <span className="text-sm">
                      {c.qualityLabels[q.id] ?? q.id}
                    </span>
                    <span className="font-mono text-sm tabular-nums">
                      {f.pct(q.missing / q.total, 2)}{' '}
                      <span className="font-sans text-muted-foreground">
                        {c.missing.toLowerCase()}
                      </span>
                    </span>
                  </div>
                  <div
                    className="flex h-2 overflow-hidden rounded-full bg-secondary"
                    title={`${c.complete}: ${f.pct(1 - q.missing / q.total)}`}
                  >
                    <div
                      className="bg-primary/75"
                      style={{ width: `${(1 - q.missing / q.total) * 100}%` }}
                    />
                    <div
                      className="bg-chart-3/60"
                      style={{ width: `${(q.missing / q.total) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={c.currencies} subtitle={c.currencyNote}>
            <div className="grid grid-cols-3 gap-3">
              {d.currencies.map((r) => (
                <div key={r.label} className="rounded-lg bg-secondary/60 p-3">
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="mt-2 font-mono text-xl tabular-nums text-primary">
                    {f.pct(r.total / d.total, 1)}
                  </p>
                  <p className="mt-1 break-all font-mono text-sm text-muted-foreground">
                    {f.n(r.total)}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
      <Panel title={c.audit} subtitle={c.auditNote}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            [
              c.registrationAfter,
              d.audit.registrationAfter,
              d.audit.transactions,
              c.trainingCohort,
            ],
            [
              c.openingAfter,
              d.audit.openingAfter,
              d.audit.transactions,
              c.trainingCohort,
            ],
            [
              c.digitalUnlinked,
              d.audit.digitalUnlinked,
              d.audit.digitalEvents,
              c.digitalCohort,
            ],
            [
              c.processingBefore,
              d.audit.processingBefore,
              d.audit.digitalEvents,
              c.digitalCohort,
            ],
          ].map(([label, count, total, cohort]) => (
            <div key={label} className="rounded-lg bg-secondary/50 p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-3 font-mono text-2xl tabular-nums text-tint-amber-fg">
                {f.pct((count as number) / (total as number), 2)}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {f.n(count as number)} / {f.n(total as number)} {cohort}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          {c.auditAction}
        </p>
      </Panel>
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4 text-primary" />
        {c.insight}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          [
            c.concentration,
            `${leader.label} · ${f.pct(leader.total / d.total, 1)} ${c.concentrated}`,
          ],
          [c.imbalance, c.imbalanceText],
          [
            c.normalization,
            `${c.normalizationText} ${f.pct(quality.amount_usd_raw.missing / d.total, 1)} ${c.to} ${f.pct(quality.amount_usd_normalized.missing / d.total, 2)}.`,
          ],
        ].map(([title, text]) => (
          <div key={title} className="rounded-xl border border-border/70 p-4">
            <h3 className="mb-2 text-sm font-semibold">{title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function OperationOverview({
  operational: o,
  from,
  to,
}: { operational: FraudOperational; from: string; to: string }) {
  const { lang } = useLang();
  const c = fraudCopy(lang);
  const f = useFormat();
  if (o.status !== 'available')
    return (
      <div
        role="status"
        className="rounded-xl border border-border bg-card/30 p-6 text-sm leading-relaxed text-muted-foreground"
      >
        {o.status === 'error' ? c.operationalError : c.unavailable}
      </div>
    );
  const days = [];
  for (let day = from; day <= to; ) {
    days.push(
      o.byDay.find((r) => r.day === day) ?? {
        day,
        total: 0,
        scored: 0,
        alerts: 0,
      },
    );
    const next = new Date(`${day}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  const peak = Math.max(1, ...days.map((d) => d.total));
  const binPeak = Math.max(1, ...o.scoreBins.map((b) => b.total));
  return (
    <div className="space-y-5" data-testid="fraud-operation">
      <p className="text-sm leading-relaxed text-muted-foreground">
        {c.complaintNote}
      </p>
      <div className="grid grid-cols-1 gap-6 rounded-xl border border-border/70 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={c.complaints} value={f.n(o.total)} accent />
        <Stat
          label={c.coverage}
          value={f.pct(fraction(o.scored, o.total), 1)}
          note={`${f.n(o.scored)} ${c.scored.toLowerCase()} · ${f.n(o.unavailable)} ${c.without.toLowerCase()}`}
        />
        <Stat label={c.alerts} value={f.n(o.alerts)} note={c.alertsNote} />
        <Stat label={c.open} value={f.n(o.open)} />
      </div>
      {o.total === 0 ? (
        <div className="flex min-h-60 flex-col items-center justify-center rounded-xl border border-dashed border-border px-6 text-center">
          <ShieldCheck className="mb-4 size-8 text-primary" />
          <h2 className="font-semibold">{c.noCases}</h2>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            {c.noCasesText}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
            <Panel
              title={c.daily}
              subtitle={`${from} → ${to}`}
              action={
                <span className="text-sm text-primary">
                  {c.scored} / {c.complaints.toLowerCase()}
                </span>
              }
            >
              <div className="overflow-x-auto">
                <svg
                  viewBox="0 0 640 230"
                  className="w-full min-w-[500px]"
                  role="img"
                  aria-label={c.daily}
                >
                  {days.map((d, i) => {
                    const w = 600 / days.length;
                    return (
                      <g key={d.day}>
                        <title>{`${d.day}: ${f.n(d.total)} · ${c.scored}: ${f.n(d.scored)} · ${c.alerts}: ${f.n(d.alerts)}`}</title>
                        <rect
                          x={20 + i * w + 2}
                          y={190 - (d.total / peak) * 155}
                          width={Math.max(1, w - 4)}
                          height={(d.total / peak) * 155}
                          rx="2"
                          className="fill-primary/25"
                        />
                        <rect
                          x={20 + i * w + 2}
                          y={190 - (d.scored / peak) * 155}
                          width={Math.max(1, w - 4)}
                          height={(d.scored / peak) * 155}
                          rx="2"
                          className="fill-primary"
                        />
                        {(i % Math.max(1, Math.ceil(days.length / 7)) === 0 ||
                          i === days.length - 1) && (
                          <text
                            x={20 + i * w + w / 2}
                            y="215"
                            textAnchor="middle"
                            className="fill-muted-foreground text-[12px]"
                          >
                            {d.day.slice(5)}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer py-3 text-muted-foreground">
                  {c.details}
                </summary>
                <Ledger
                  headers={[c.selected, c.complaints, c.scored, c.alerts]}
                  rows={days.map((d) => [
                    d.day,
                    f.n(d.total),
                    f.n(d.scored),
                    f.n(d.alerts),
                  ])}
                />
              </details>
            </Panel>
            <Panel title={c.scoreDistribution} subtitle={c.scoreNote}>
              {o.scored === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {c.noScore}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <svg
                      viewBox="0 0 600 240"
                      role="img"
                      aria-label={c.scoreDistribution}
                      className="w-full min-w-[500px]"
                    >
                      {o.scoreBins.map((b) => (
                        <g key={b.bin}>
                          <title>{`${b.bin * 10}–${(b.bin + 1) * 10}: ${f.n(b.total)}`}</title>
                          <text
                            x={30 + b.bin * 56}
                            y={170 - (b.total / binPeak) * 120}
                            textAnchor="middle"
                            className="fill-foreground text-[13px]"
                          >
                            {b.total || ''}
                          </text>
                          <rect
                            x={10 + b.bin * 56}
                            y={180 - (b.total / binPeak) * 120}
                            width="40"
                            height={(b.total / binPeak) * 120}
                            rx="3"
                            className="fill-primary/75"
                          />
                          <text
                            x={30 + b.bin * 56}
                            y="205"
                            textAnchor="middle"
                            className="fill-muted-foreground text-[12px]"
                          >
                            {b.bin * 10}–{(b.bin + 1) * 10}
                          </text>
                        </g>
                      ))}
                    </svg>
                  </div>
                  <details className="text-sm">
                    <summary className="cursor-pointer py-3 text-muted-foreground">
                      {c.details}
                    </summary>
                    <Ledger
                      headers={[c.scoreDistribution, c.count]}
                      rows={o.scoreBins.map((b) => [
                        `${b.bin * 10}–${(b.bin + 1) * 10}${b.bin === 9 ? ' (≤100)' : ' (<)'}`,
                        f.n(b.total),
                      ])}
                    />
                  </details>
                </>
              )}
            </Panel>
          </div>
          <Panel title={c.categories}>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {o.byType.map((r) => (
                <div key={r.type} className="rounded-lg bg-secondary/50 p-4">
                  <p className="text-sm text-muted-foreground">
                    {c.complaintTypes[r.type] ?? c.complaintTypes.other}
                  </p>
                  <p className="mt-2 font-mono text-2xl tabular-nums">
                    {f.n(r.total)}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}
      <div className="flex flex-wrap items-start gap-4 rounded-xl border border-border/70 bg-primary/5 p-5">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{c.workflow}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {c.workflowText}
          </p>
        </div>
        <Link
          to="/conversations"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary/10"
        >
          {lang === 'pt' ? 'Abrir reclamações' : 'Abrir reclamos'}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

export function ModelOverview({ snapshot }: { snapshot: FraudSnapshot }) {
  const { lang } = useLang();
  const c = fraudCopy(lang);
  const f = useFormat();
  const model = snapshot.model;
  const v7 = model.versions.find((v) => v.id === 'V7')!.metrics;
  const peak = Math.max(
    0.000001,
    ...model.monthly.flatMap((r) => [r.v7.precision, r.v9.precision]),
  );
  return (
    <div className="space-y-5" data-testid="fraud-model">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md bg-primary/10 px-2.5 py-1 font-medium text-primary">
          {model.algorithm} · V7
        </span>
        <span className="text-muted-foreground">{c.validationPeriod}</span>
      </div>
      <div className="grid grid-cols-1 gap-6 rounded-xl border border-border/70 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={c.precision}
          value={f.pct(v7.precision, 4)}
          note={`${f.n(v7.tp)} / ${f.n(v7.alerts)} · ${c.precisionNote}`}
        />
        <Stat
          label={c.recall}
          value={f.pct(v7.recall, 3)}
          note={`${f.n(v7.tp)} / ${f.n(v7.fraud)} · ${c.recallNote}`}
        />
        <Stat
          label={c.ap}
          value={v7.average_precision.toFixed(6)}
          note={`${c.prevalence}: ${f.pct(v7.fraud / v7.rows, 4)}`}
        />
        <Stat
          label={c.roc}
          value={v7.roc_auc.toFixed(4)}
          note={
            lang === 'pt'
              ? '0,5 ≈ ordenação aleatória'
              : '0,5 ≈ ordenamiento aleatorio'
          }
        />
      </div>
      <Panel title={c.compare} subtitle={c.modelNote}>
        <Ledger
          headers={[
            c.modelColumn,
            c.result,
            c.precision,
            c.recall,
            c.trueAlerts,
            c.roc,
          ]}
          rows={model.versions.map((v) => [
            <span className="font-mono font-semibold">{v.id}</span>,
            <span
              className={cn(
                'rounded-md px-2 py-1 text-sm',
                v.role === 'serving'
                  ? 'bg-primary/10 text-primary'
                  : 'bg-secondary text-muted-foreground',
              )}
            >
              {v.role === 'serving' ? c.serving : c.rejected}
            </span>,
            <span className="font-mono">{f.pct(v.metrics.precision, 4)}</span>,
            f.pct(v.metrics.recall, 3),
            `${f.n(v.metrics.tp)} / ${f.n(v.metrics.alerts)}`,
            v.metrics.roc_auc.toFixed(4),
          ])}
        />
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {c.silverCaveat}
        </p>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <Panel
          title={c.monthly}
          subtitle={c.monthlyNote}
          action={
            <div className="flex gap-4 text-sm">
              <span className="text-primary">● V7</span>
              <span className="text-chart-3">● V9</span>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <svg
              viewBox="0 0 680 240"
              role="img"
              aria-label={`${c.monthly}: V7 / V9`}
              className="w-full min-w-[550px]"
            >
              {model.monthly.map((r, i) => (
                <g key={r.month}>
                  <title>{`${r.month} · V7: ${f.pct(r.v7.precision, 4)} (${r.v7.tp}/${r.v7.alerts}) · V9: ${f.pct(r.v9.precision, 4)} (${r.v9.tp}/${r.v9.alerts})`}</title>
                  <rect
                    x={35 + i * 105}
                    y={185 - (r.v7.precision / peak) * 145}
                    width="28"
                    height={(r.v7.precision / peak) * 145}
                    rx="2"
                    className="fill-primary"
                  />
                  <rect
                    x={68 + i * 105}
                    y={185 - (r.v9.precision / peak) * 145}
                    width="28"
                    height={(r.v9.precision / peak) * 145}
                    rx="2"
                    className="fill-chart-3/80"
                  />
                  <text
                    x={66 + i * 105}
                    y={30}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[12px]"
                  >
                    {f.pct(r.v7.precision, 3)}
                  </text>
                  <text
                    x={66 + i * 105}
                    y="212"
                    textAnchor="middle"
                    className="fill-muted-foreground text-[13px]"
                  >
                    {f.month(r.month)}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer py-3 text-muted-foreground">
              {c.details}
            </summary>
            <Ledger
              headers={[c.selected, 'V7', 'V9']}
              rows={model.monthly.map((r) => [
                r.month,
                f.pct(r.v7.precision, 4),
                f.pct(r.v9.precision, 4),
              ])}
            />
          </details>
        </Panel>
        <Panel title={c.confusion}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              [c.truePositive, v7.tp, 'text-primary'],
              [c.falsePositive, v7.fp, 'text-tint-amber-fg'],
              [c.falseNegative, v7.fn, 'text-destructive'],
              [c.trueNegative, v7.tn, 'text-foreground'],
            ].map(([label, count, color]) => (
              <div key={label} className="rounded-lg bg-secondary/60 p-4">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p
                  className={cn('mt-2 font-mono text-2xl tabular-nums', color)}
                >
                  {f.n(count as number)}
                </p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title={c.moreData} subtitle={c.moreDataText}>
          <div className="space-y-4">
            {model.digitalCoverage.map((v) => (
              <div key={v.id}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>
                    {v.id} · {v.id === 'V8' ? '7d' : '90d'}
                  </span>
                  <span className="font-mono">
                    {f.pct(v.covered / v.total, 1)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${(v.covered / v.total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={c.controls}>
          <ul className="space-y-3">
            {[c.human, c.automatic, c.sealed, c.leakage].map((text) => (
              <li key={text} className="flex items-center gap-2 text-sm">
                <ShieldCheck className="size-4 shrink-0 text-primary" />
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-5 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">{c.threshold}</p>
            <p className="mt-1 font-mono text-xl">
              {(model.threshold * 100).toFixed(3)} / 100
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {c.thresholdNote}
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function EvidenceFooter({ snapshot }: { snapshot: FraudSnapshot }) {
  const { lang } = useLang();
  const c = fraudCopy(lang);
  return (
    <details className="rounded-xl border border-border/70 px-4 py-1 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-muted-foreground">
        <Fingerprint className="size-4" />
        {c.source}
        <span className="ml-auto text-primary">{c.evidence}</span>
      </summary>
      <div className="space-y-4 border-t border-border py-4">
        <p className="flex items-center gap-2">
          <Database className="size-4 shrink-0 text-primary" />
          {c.historical}
        </p>
        <p className="break-all font-mono text-sm text-muted-foreground">
          {snapshot.dataset.source} · Delta v{snapshot.dataset.deltaVersion} ·{' '}
          {snapshot.dataset.profiledAt}
        </p>
        <p className="break-all font-mono text-sm text-muted-foreground">
          {snapshot.model.source} · Delta v{snapshot.model.deltaVersion} ·
          MLflow {snapshot.model.runId}
        </p>
        {snapshot.evidence.map((e) => (
          <div key={e.path} className="min-w-0">
            <p className="break-all text-muted-foreground">{e.path}</p>
            <p className="mt-1 break-all font-mono text-sm text-muted-foreground">
              SHA-256 {e.sha256}
            </p>
          </div>
        ))}
      </div>
    </details>
  );
}
