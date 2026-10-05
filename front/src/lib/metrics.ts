// Resolution metrics for the admin: GET /api/advisor/metrics?from&to&tz (back
// PR #47, docs/flujo-atencion.md §6). Every closure is an event; total =
// aiContained + human + assisted. Days are the viewer's local days: the back
// reads from/to and groups byDay in `tz`.

import { OTHER_GROUP, USE_CASES } from '@/lib/advisor';
import { tr } from '@/lib/i18n';

export interface Resolutions {
  total: number;
  aiContained: number;
  human: number;
  assisted: number;
}

export interface DayResolutions extends Resolutions {
  day: string;
}

export interface Metrics extends Resolutions {
  byUseCase: Record<string, Resolutions>;
  byDay: DayResolutions[];
}

export type MetricsRange = 'today' | 'week' | 'month';

export const RANGES: { id: MetricsRange; label: string; days: number }[] = [
  { id: 'today', get label() { return tr().today; }, days: 1 },
  { id: 'week', get label() { return tr().metrics.range7; }, days: 7 },
  { id: 'month', get label() { return tr().metrics.range30; }, days: 30 },
];

export const EMPTY_METRICS: Metrics = {
  total: 0,
  aiContained: 0,
  human: 0,
  assisted: 0,
  byUseCase: {},
  byDay: [],
};

// The browser's IANA time zone (e.g. "America/Lima"); UTC if unknown.
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// YYYY-MM-DD of an instant as a calendar day in `timeZone`.
export function localDay(date: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// Calendar arithmetic on YYYY-MM-DD (no time zone involved).
function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export interface MetricsWindow {
  from: string;
  to: string;
  tz: string;
}

// Inclusive local days in `timeZone`: today, or the last 7 or 30 days ending today.
export function rangeDays(range: MetricsRange, now: Date, timeZone: string): MetricsWindow {
  const to = localDay(now, timeZone);
  const days = RANGES.find((r) => r.id === range)?.days ?? 1;
  return { from: addDays(to, -(days - 1)), to, tz: timeZone };
}

export function metricsUrl({ from, to, tz }: MetricsWindow): string {
  return `/api/advisor/metrics?${new URLSearchParams({ from, to, tz }).toString()}`;
}

const count = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;

function parseResolutions(raw: unknown): Resolutions {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    total: count(r.total),
    aiContained: count(r.aiContained),
    human: count(r.human),
    assisted: count(r.assisted),
  };
}

// The one place that knows the response shape. Missing or bad numbers read as 0.
export function parseMetrics(body: unknown): Metrics {
  const raw = (body ?? {}) as { byUseCase?: unknown; byDay?: unknown };
  const byUseCase: Record<string, Resolutions> = {};
  if (raw.byUseCase && typeof raw.byUseCase === 'object') {
    for (const [id, value] of Object.entries(raw.byUseCase)) {
      byUseCase[id] = parseResolutions(value);
    }
  }
  const byDay = Array.isArray(raw.byDay)
    ? raw.byDay
        .filter((d): d is { day: string } => typeof d?.day === 'string')
        .map((d) => ({ day: d.day, ...parseResolutions(d) }))
    : [];
  return { ...parseResolutions(body), byUseCase, byDay };
}

export class MetricsRequestError extends Error {
  constructor(public status: number) {
    super(`Metrics API responded ${status}`);
  }
}

export async function fetchMetrics(url: string): Promise<Metrics> {
  const res = await fetch(url, { credentials: 'include' });
  // 204: the back has no database, so there is nothing to count.
  if (res.status === 204) return EMPTY_METRICS;
  if (!res.ok) throw new MetricsRequestError(res.status);
  return parseMetrics(await res.json());
}

// Share of closures David resolved end to end, 0–100 (rounded).
export function containmentPct(r: Resolutions): number {
  return r.total ? Math.round((r.aiContained / r.total) * 100) : 0;
}

const KNOWN = new Set<string>(USE_CASES.map((u) => u.id));

export interface UseCaseRow extends Resolutions {
  id: string;
}

// One row per use case with closures, largest first. NONE (no use case) and
// ids the console doesn't list go under "Otras", as in the inbox.
export function useCaseRows(metrics: Metrics): UseCaseRow[] {
  const rows = new Map<string, UseCaseRow>();
  for (const [raw, r] of Object.entries(metrics.byUseCase)) {
    // RETENTION and CANCEL are one reason: "Cancelación de producto".
    const id = raw === 'RETENTION' ? 'CANCEL' : KNOWN.has(raw) ? raw : OTHER_GROUP;
    const row = rows.get(id) ?? { id, total: 0, aiContained: 0, human: 0, assisted: 0 };
    row.total += r.total;
    row.aiContained += r.aiContained;
    row.human += r.human;
    row.assisted += r.assisted;
    rows.set(id, row);
  }
  return [...rows.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
}

// Every day of the range, in order; the back only sends days with events.
export function fillDays(byDay: DayResolutions[], from: string, to: string): DayResolutions[] {
  const known = new Map(byDay.map((d) => [d.day, d]));
  const days: DayResolutions[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(known.get(day) ?? { day, total: 0, aiContained: 0, human: 0, assisted: 0 });
  }
  return days;
}

function parts(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  return { weekday: date.getUTCDay(), date: date.getUTCDate(), month: date.getUTCMonth() };
}

// "Lun 22" under a week's bars, just the day number for a month.
export function dayLabel(day: string, long: boolean): string {
  const p = parts(day);
  return long ? `${tr().metrics.weekdays[p.weekday]} ${p.date}` : String(p.date);
}

// "Hoy, 28 de septiembre" or "22 – 28 de septiembre".
export function rangeCaption(range: MetricsRange, from: string, to: string): string {
  const { today, metrics } = tr();
  const f = parts(from);
  const t = parts(to);
  const end = metrics.dayOfMonth(t.date, metrics.months[t.month]);
  if (range === 'today') return `${today}, ${end}`;
  const start =
    f.month === t.month ? `${f.date}` : metrics.dayOfMonth(f.date, metrics.months[f.month]);
  return `${start} – ${end}`;
}
