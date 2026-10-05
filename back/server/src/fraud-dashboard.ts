import type { FraudAggregateRow } from '../../packages/db/src/fraud-dashboard';
import type { FraudOperational } from '../../packages/utils/src/fraud-dashboard';

export function aggregateFraudRows(
  rows: FraudAggregateRow[],
  status: FraudOperational['status'] = 'available',
): FraudOperational {
  const result: FraudOperational = {
    status,
    total: 0,
    scored: 0,
    alerts: 0,
    unavailable: 0,
    open: 0,
    closed: 0,
    byDay: [],
    byType: [],
    scoreBins: [],
  };
  const days = new Map<
    string,
    { day: string; total: number; scored: number; alerts: number }
  >();
  const types = new Map<string, number>();
  const bins = Array.from({ length: 10 }, (_, bin) => ({ bin, total: 0 }));
  for (const row of rows) {
    const n = Number(row.total);
    if (!Number.isSafeInteger(n) || n < 0)
      throw new Error('Invalid aggregate count');
    const day = days.get(row.day) ?? {
      day: row.day,
      total: 0,
      scored: 0,
      alerts: 0,
    };
    result.total += n;
    day.total += n;
    result[row.closed ? 'closed' : 'open'] += n;
    types.set(row.type, (types.get(row.type) ?? 0) + n);
    if (row.scored) {
      result.scored += n;
      day.scored += n;
      if (
        !Number.isInteger(row.scoreBin) ||
        row.scoreBin < 0 ||
        row.scoreBin > 9
      )
        throw new Error('Invalid score bin');
      bins[row.scoreBin].total += n;
      if (row.alert) {
        result.alerts += n;
        day.alerts += n;
      }
    }
    days.set(row.day, day);
  }
  result.unavailable = result.total - result.scored;
  result.byDay = [...days.values()].sort((a, b) => a.day.localeCompare(b.day));
  result.byType = [...types]
    .map(([type, total]) => ({ type, total }))
    .sort((a, b) => b.total - a.total);
  result.scoreBins = bins;
  return result;
}

export function validFraudWindow(from: string, to: string): boolean {
  const parse = (s: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
    const ms = Date.parse(`${s}T00:00:00Z`);
    return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === s
      ? ms
      : NaN;
  };
  const start = parse(from),
    end = parse(to);
  return (
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end >= start &&
    end - start < 31 * 86400000
  );
}
