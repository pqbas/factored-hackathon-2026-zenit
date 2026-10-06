import { test, expect } from '@playwright/test';
import {
  parseRetention,
  parseLiveFraud,
} from '../../server/src/analytics-data';
import evidence from '../../../ml/reports/2026-10-05/admin_analytics_data.json';
const retentionRows = () =>
  structuredClone(
    evidence.queries.find((q) => q.label === 'retention_dashboard')!.rows,
  ) as Record<string, string | null>[];
const fraudRows = () =>
  structuredClone(
    evidence.queries.find((q) => q.label === 'live_fraud_dashboard')!.rows,
  ) as Record<string, string | null>[];
test('verified aggregate cohorts reconcile without loading customer records', () => {
  const data = parseRetention(retentionRows());
  expect(data.eligibleCustomers).toBe(114516);
  expect(data.asOf).toBe('2026-06-18');
  expect(data.bands.find((b) => b.band === 'high')?.total).toBe(446);
  expect(data.customers).toEqual([]);
  const fraud = parseLiveFraud(fraudRows());
  expect(fraud.total).toBe(3738506);
  expect(fraud.fraud).toBe(3713);
  expect(fraud.duplicates).toBeNull();
});
test('inconsistent as-of snapshots and aggregate counts fail validation', () => {
  const rows = retentionRows();
  const m = JSON.parse(rows[0].payload!);
  rows[0].payload = JSON.stringify({ ...m, minAsOf: '2026-06-17' });
  expect(() => parseRetention(rows)).toThrow('snapshot');
  const good = retentionRows();
  good.splice(
    good.findIndex((r) => r.section === 'bands'),
    1,
  );
  expect(() => parseRetention(good)).toThrow('aggregate');
});
test('shortlists reject direct identifiers and oversized country/priority cohorts', () => {
  const rows = retentionRows();
  const customer = {
    ref: 'abcdef123456',
    country: 'México',
    segment: 'Basic',
    band: 'high',
    signals: ['inactive'],
    inactiveDays: 70,
    tx30: 0,
    txPrevious30: 0,
    openCases: 1,
    csat: null,
    csatResponses: 0,
    families: 3,
  };
  expect(() =>
    parseRetention([
      ...rows,
      {
        section: 'customers',
        payload: JSON.stringify({ ...customer, ref: 'real-customer-123' }),
      },
    ]),
  ).toThrow();
  const oversized = Array.from({ length: 16 }, (_, i) => ({
    section: 'customers',
    payload: JSON.stringify({
      ...customer,
      ref: i.toString(16).padStart(12, '0'),
    }),
  }));
  expect(() => parseRetention([...rows, ...oversized])).toThrow('limits');
});
test('fraud overview rejects new final-test data and inconsistent currency aggregates', () => {
  const rows = fraudRows();
  rows.find((r) => r.section === 'summary')!.max_date = '2026-01-01 00:00:00';
  expect(() => parseLiveFraud(rows)).toThrow('cohort');
  const good = fraudRows();
  good.splice(
    good.findIndex((r) => r.section === 'currencies'),
    1,
  );
  expect(() => parseLiveFraud(good)).toThrow('aggregate');
});
