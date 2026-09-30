import { expect, test } from '@playwright/test';
import {
  buildSavingsHistory,
  savingsWindowStart,
  type SavingsMovement,
} from '../../server/src/savings-history';

const now = new Date('2026-09-30T15:00:00Z');

const move = (
  date: string,
  type: string,
  amount: number,
  currency = 'USD',
): SavingsMovement => ({ currency, date, type, amount });

test.describe('buildSavingsHistory', () => {
  test('the window starts on the 1st of the month 11 months ago (UTC)', () => {
    expect(savingsWindowStart(now).toISOString()).toBe(
      '2025-10-01T00:00:00.000Z',
    );
  });

  test("rebuilds Natalia's savings month by month back from today", () => {
    // Her movements in prod inside the window (the older ones don't matter).
    const movements = [
      move('2025-11-21T22:25:35.000Z', 'Withdrawal', 234.54),
      move('2026-03-19T04:13:46.000Z', 'Deposit', 2927.26),
      move('2026-04-02T02:02:05.000Z', 'Withdrawal', 49.99),
      move('2026-04-06T01:13:39.000Z', 'Withdrawal', 27.16),
      move('2026-04-07T01:36:16.000Z', 'Transfer', 4382.43),
      move('2026-05-06T06:50:08.000Z', 'Transfer', 9327.92),
    ];
    const [series] = buildSavingsHistory(
      [{ currency: 'USD', balance: 2508.39 }],
      movements,
      now,
    );
    expect(series).toEqual({
      currency: 'USD',
      current: 2508.39,
      points: [
        { month: '2025-10', balance: 13603.17 },
        { month: '2025-11', balance: 13368.63 },
        { month: '2025-12', balance: 13368.63 },
        { month: '2026-01', balance: 13368.63 },
        { month: '2026-02', balance: 13368.63 },
        { month: '2026-03', balance: 16295.89 },
        { month: '2026-04', balance: 11836.31 },
        { month: '2026-05', balance: 2508.39 },
        { month: '2026-06', balance: 2508.39 },
        { month: '2026-07', balance: 2508.39 },
        { month: '2026-08', balance: 2508.39 },
        { month: '2026-09', balance: 2508.39 },
      ],
    });
  });

  test('sums the accounts of a currency; a movement of this month changes only past months', () => {
    const [series] = buildSavingsHistory(
      [
        { currency: 'ARS', balance: 1000 },
        { currency: 'ARS', balance: 500 },
      ],
      [move('2026-09-02T10:00:00.000Z', 'Payment', 200, 'ARS')],
      now,
    );
    expect(series.current).toBe(1500);
    expect(series.points.at(-1)).toEqual({ month: '2026-09', balance: 1500 });
    expect(series.points.at(-2)).toEqual({ month: '2026-08', balance: 1700 });
    expect(series.points[0]).toEqual({ month: '2025-10', balance: 1700 });
  });

  test('a currency that goes negative is left out, the others stay', () => {
    const series = buildSavingsHistory(
      [
        { currency: 'USD', balance: 100 },
        { currency: 'MXN', balance: 50 },
      ],
      // 300 deposited in August: before it the USD balance was -200.
      [move('2026-08-10T10:00:00.000Z', 'Deposit', 300)],
      now,
    );
    expect(series.map((s) => s.currency)).toEqual(['MXN']);
  });

  test("a negative balance before the first month's movements also leaves it out", () => {
    const series = buildSavingsHistory(
      [{ currency: 'USD', balance: 100 }],
      [move('2025-10-05T10:00:00.000Z', 'Deposit', 150)],
      now,
    );
    expect(series).toEqual([]);
  });

  test('without movements the series is flat; without accounts, empty', () => {
    const [flat] = buildSavingsHistory(
      [{ currency: 'COP', balance: 900.5 }],
      [],
      now,
    );
    expect(flat.points).toHaveLength(12);
    expect(new Set(flat.points.map((p) => p.balance))).toEqual(
      new Set([900.5]),
    );
    expect(buildSavingsHistory([], [], now)).toEqual([]);
  });
});
