// Resolution metrics for the admin: GET /api/advisor/metrics?from&to (back
// PR #47, docs/flujo-atencion.md §6). Every closure is an event; total =
// aiContained + human + assisted.

import { OTHER_GROUP, USE_CASES } from '@/lib/advisor';

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
  { id: 'today', label: 'Hoy', days: 1 },
  { id: 'week', label: '7 días', days: 7 },
  { id: 'month', label: '30 días', days: 30 },
];

export const EMPTY_METRICS: Metrics = {
  total: 0,
  aiContained: 0,
  human: 0,
  assisted: 0,
  byUseCase: {},
  byDay: [],
};

// YYYY-MM-DD of a date in UTC, the back's day boundary.
export function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return utcDay(date);
}

// Inclusive UTC days: today, or the last 7 or 30 days ending today.
export function rangeDays(range: MetricsRange, now: Date): { from: string; to: string } {
  const to = utcDay(now);
  const days = RANGES.find((r) => r.id === range)?.days ?? 1;
  return { from: addDays(to, -(days - 1)), to };
}

export function metricsUrl({ from, to }: { from: string; to: string }): string {
  return `/api/advisor/metrics?${new URLSearchParams({ from, to }).toString()}`;
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
    const id = KNOWN.has(raw) ? raw : OTHER_GROUP;
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

const WEEKDAY = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function parts(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  return { weekday: date.getUTCDay(), date: date.getUTCDate(), month: date.getUTCMonth() };
}

// "Lun 22" under a week's bars, just the day number for a month.
export function dayLabel(day: string, long: boolean): string {
  const p = parts(day);
  return long ? `${WEEKDAY[p.weekday]} ${p.date}` : String(p.date);
}

// "Hoy, 28 de septiembre" or "22 – 28 de septiembre".
export function rangeCaption(range: MetricsRange, from: string, to: string): string {
  const f = parts(from);
  const t = parts(to);
  if (range === 'today') return `Hoy, ${t.date} de ${MONTH[t.month]}`;
  const start = f.month === t.month ? `${f.date}` : `${f.date} de ${MONTH[f.month]}`;
  return `${start} – ${t.date} de ${MONTH[t.month]}`;
}
