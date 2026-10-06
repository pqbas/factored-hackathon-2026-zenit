import { expect, test } from '@playwright/test';
import { PgDialect } from 'drizzle-orm/pg-core';
import { fraudDashboardQuery } from '../../packages/db/src/fraud-dashboard';
import {
  aggregateFraudRows,
  validFraudWindow,
} from '../../server/src/fraud-dashboard';
import snapshot from '../../server/src/data/fraud-dashboard.json';

test('limits the inclusive window to 31 real calendar days', () => {
  expect(validFraudWindow('2026-10-01', '2026-10-31')).toBe(true);
  for (const [a, b] of [
    ['2026-09-01', '2026-10-31'],
    ['2026-02-30', '2026-03-01'],
    ['2026-10-05', '2026-10-04'],
    ['yesterday', 'today'],
  ])
    expect(validFraudWindow(a, b)).toBe(false);
});

test('aggregates predictions without equating closure or alerts with confirmed fraud', () => {
  const result = aggregateFraudRows([
    {
      day: '2026-10-05',
      type: 'not_recognized',
      scored: true,
      alert: false,
      closed: false,
      scoreBin: 0,
      total: 3,
    },
    {
      day: '2026-10-05',
      type: 'duplicate_charge',
      scored: true,
      alert: true,
      closed: true,
      scoreBin: 9,
      total: 2,
    },
    {
      day: '2026-10-04',
      type: 'other',
      scored: false,
      alert: false,
      closed: false,
      scoreBin: -1,
      total: 4,
    },
  ]);
  expect(result).toMatchObject({
    status: 'available',
    total: 9,
    scored: 5,
    alerts: 2,
    unavailable: 4,
    open: 7,
    closed: 2,
  });
  expect(result.byDay[0].day).toBe('2026-10-04');
  expect(result.scoreBins.reduce((sum, b) => sum + b.total, 0)).toBe(5);
  expect(result).not.toHaveProperty('confirmedFraud');
});

test('empty, unavailable and failed storage remain different states', () => {
  expect(aggregateFraudRows([]).status).toBe('available');
  expect(aggregateFraudRows([], 'unavailable').status).toBe('unavailable');
  expect(aggregateFraudRows([], 'error').status).toBe('error');
});

test('query is parameterized and returns aggregates only', () => {
  const rendered = new PgDialect().sqlToQuery(
    fraudDashboardQuery({
      from: '2026-10-01',
      to: '2026-10-05',
      tz: 'America/Lima',
    }),
  );
  expect(rendered.params).toContain('America/Lima');
  expect(rendered.params).toContain('2026-10-01');
  expect(rendered.sql).not.toMatch(
    /\b(insert|update|delete|drop|alter|truncate)\b/i,
  );
  expect(rendered.sql).toContain(
    "jsonb_typeof(assessment -> 'risk_score') = 'number'",
  );
  expect(rendered.sql).toContain('score between 0 and 1');
  expect(rendered.sql).toContain(
    "'automatic_decisions_enabled' = 'false'::jsonb",
  );
  expect(rendered.sql).toContain('group by');
  expect(rendered.sql).not.toContain('"chatId"');
});

test('historical segments reconcile and final-test model performance is absent', () => {
  for (const rows of [
    snapshot.dataset.countries,
    snapshot.dataset.channels,
    snapshot.dataset.types,
  ]) {
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(snapshot.dataset.total);
    expect(rows.reduce((n, r) => n + r.fraud, 0)).toBe(snapshot.dataset.fraud);
  }
  expect(snapshot.model.finalTestUsed).toBe(false);
  expect(snapshot.model.automaticDecisionsEnabled).toBe(false);
  expect(snapshot.dataset.monthly.every((r) => r.month < '2026-01')).toBe(true);
  expect(snapshot.model.versions[0].metrics.precision).toBeCloseTo(
    6 / 7224,
    12,
  );
  expect(snapshot.model.monthly.reduce((n, r) => n + r.v7.tp, 0)).toBe(6);
});
