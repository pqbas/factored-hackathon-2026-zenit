import { describe, expect, it } from 'vitest';

import {
  containmentPct,
  dayLabel,
  fillDays,
  localDay,
  metricsUrl,
  parseMetrics,
  rangeCaption,
  rangeDays,
  useCaseRows,
} from '@/lib/metrics';

const r = (total: number, aiContained: number, human: number, assisted: number) => ({
  total,
  aiContained,
  human,
  assisted,
});

describe('rangeDays and metricsUrl', () => {
  // 22:30 in Lima (UTC-5) on the 28th is already 03:30 UTC on the 29th.
  const limaNight = new Date('2026-09-29T03:30:00.000Z');

  it('counts the viewer\'s local days, not UTC days', () => {
    expect(localDay(limaNight, 'America/Lima')).toBe('2026-09-28');
    expect(localDay(limaNight, 'UTC')).toBe('2026-09-29');
    expect(rangeDays('today', limaNight, 'America/Lima')).toEqual({
      from: '2026-09-28',
      to: '2026-09-28',
      tz: 'America/Lima',
    });
    expect(rangeDays('week', limaNight, 'America/Lima')).toMatchObject({ from: '2026-09-22', to: '2026-09-28' });
    expect(rangeDays('month', limaNight, 'America/Lima')).toMatchObject({ from: '2026-08-30', to: '2026-09-28' });
  });

  it('sends from, to and the time zone', () => {
    expect(metricsUrl({ from: '2026-09-22', to: '2026-09-28', tz: 'America/Lima' })).toBe(
      '/api/advisor/metrics?from=2026-09-22&to=2026-09-28&tz=America%2FLima',
    );
  });
});

describe('parseMetrics', () => {
  it('reads the contract and turns bad numbers into 0', () => {
    const metrics = parseMetrics({
      total: 10,
      aiContained: 6,
      human: 'x',
      assisted: -1,
      byUseCase: { COMPLAINT: { total: 3, aiContained: 1, human: 2 } },
      byDay: [{ day: '2026-09-28', total: 10, aiContained: 6, human: 2, assisted: 2 }, { total: 1 }],
    });
    expect(metrics).toMatchObject({ total: 10, aiContained: 6, human: 0, assisted: 0 });
    expect(metrics.byUseCase.COMPLAINT).toEqual(r(3, 1, 2, 0));
    expect(metrics.byDay).toEqual([{ day: '2026-09-28', ...r(10, 6, 2, 2) }]);
  });

  it('reads null as empty', () => {
    expect(parseMetrics(null)).toEqual({ ...r(0, 0, 0, 0), byUseCase: {}, byDay: [] });
  });
});

describe('containmentPct', () => {
  it('is aiContained over total, rounded', () => {
    expect(containmentPct(r(318, 201, 72, 45))).toBe(63);
    expect(containmentPct(r(0, 0, 0, 0))).toBe(0);
  });
});

describe('useCaseRows', () => {
  it('puts NONE and unlisted ids under Otras and sorts by total', () => {
    const rows = useCaseRows(
      parseMetrics({
        byUseCase: {
          COMPLAINT: r(3, 1, 2, 0),
          NONE: r(2, 2, 0, 0),
          GREETING: r(4, 4, 0, 0),
          GENERAL_INQUIRY: r(9, 8, 1, 0),
          CANCEL: r(0, 0, 0, 0),
        },
      }),
    );
    expect(rows.map((row) => [row.id, row.total, row.aiContained])).toEqual([
      ['GENERAL_INQUIRY', 9, 8],
      ['OTHER', 6, 6],
      ['COMPLAINT', 3, 1],
    ]);
  });
});

describe('fillDays', () => {
  it('fills the days without events with zeros', () => {
    const days = fillDays([{ day: '2026-09-27', ...r(5, 3, 1, 1) }], '2026-09-26', '2026-09-28');
    expect(days.map((d) => [d.day, d.total])).toEqual([
      ['2026-09-26', 0],
      ['2026-09-27', 5],
      ['2026-09-28', 0],
    ]);
  });

  it('crosses a month', () => {
    expect(fillDays([], '2026-08-30', '2026-09-02').map((d) => d.day)).toEqual([
      '2026-08-30',
      '2026-08-31',
      '2026-09-01',
      '2026-09-02',
    ]);
  });
});

describe('labels', () => {
  it('names days and ranges in Spanish', () => {
    expect(dayLabel('2026-09-28', true)).toBe('Lun 28');
    expect(dayLabel('2026-09-28', false)).toBe('28');
    expect(rangeCaption('today', '2026-09-28', '2026-09-28')).toBe('Hoy, 28 de septiembre');
    expect(rangeCaption('week', '2026-09-22', '2026-09-28')).toBe('22 – 28 de septiembre');
    expect(rangeCaption('month', '2026-08-30', '2026-09-28')).toBe(
      '30 de agosto – 28 de septiembre',
    );
  });
});
