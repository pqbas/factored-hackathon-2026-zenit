import type {
  AnalyticsSource,
  RetentionData,
  RetentionResponse,
} from '../../packages/utils/src/retention';
import type { FraudSnapshot } from '../../packages/utils/src/fraud-dashboard';
import { AnalyticsCache } from './analytics-cache';
import { analyticsWarehouseQuery } from './analytics-warehouse';
import { analyticsSnapshotQuery, type SnapshotName } from './analytics-snapshot';
import { RETENTION_SQL } from './retention-sql';
import { FRAUD_LIVE_SQL } from './fraud-live-sql';
import { z } from 'zod';

const count = z.number().int().nonnegative().safe();
const band = z.enum(['high', 'medium', 'watch', 'none']);
const date = z.iso.date();
const meta = z.object({
  asOf: date,
  minAsOf: date,
  totalCustomers: count,
  eligibleCustomers: count,
  activityUnknown: count,
});
const schemas = {
  bands: z.object({ band, total: count }),
  countries: z.object({
    country: z.string(),
    total: count,
    high: count,
    medium: count,
    watch: count,
    none: count,
  }),
  segments: z.object({ segment: z.string(), total: count, high: count }),
  signals: z.object({
    id: z.enum([
      'inactive',
      'declining',
      'unresolved',
      'repeated',
      'low_csat',
      'negative_sentiment',
      'cancellation',
    ]),
    total: count,
  }),
  customers: z.object({
    ref: z.string().regex(/^[a-f0-9]{12}$/),
    country: z.string(),
    segment: z.string(),
    band,
    signals: z.array(z.string()),
    inactiveDays: count.nullish().transform((v) => v ?? null),
    tx30: count,
    txPrevious30: count,
    openCases: count,
    csat: z
      .number()
      .min(1)
      .max(5)
      .nullish()
      .transform((v) => v ?? null),
    csatResponses: count,
    families: z.number().int().min(0).max(4),
  }),
};

export function parseRetention(
  rows: Record<string, string | null>[],
): RetentionData {
  const metadata = rows.filter((r) => r.section === 'metadata');
  if (metadata.length !== 1) throw new Error('Invalid retention metadata');
  const m = meta.parse(JSON.parse(metadata[0].payload ?? 'null'));
  if (
    m.asOf !== m.minAsOf ||
    m.eligibleCustomers > m.totalCustomers ||
    m.activityUnknown > m.eligibleCustomers
  )
    throw new Error('Inconsistent snapshot cohort');
  const data: RetentionData = {
    ruleVersion: 'retention_signals_v1',
    asOf: m.asOf,
    totalCustomers: m.totalCustomers,
    eligibleCustomers: m.eligibleCustomers,
    activityUnknown: m.activityUnknown,
    bands: [],
    countries: [],
    segments: [],
    signals: [],
    customers: [],
    perCountryBandLimit: 15,
  };
  for (const key of Object.keys(schemas) as (keyof typeof schemas)[]) {
    const values = rows
      .filter((r) => r.section === key)
      .map((r) => schemas[key].parse(JSON.parse(r.payload ?? 'null')));
    (data[key] as unknown[]) = values;
  }
  for (const list of [data.bands, data.countries, data.segments]) {
    if (list.reduce((n, r) => n + r.total, 0) !== m.eligibleCustomers)
      throw new Error('Retention aggregate mismatch');
  }
  for (const list of [
    data.bands.map((r) => r.band),
    data.countries.map((r) => r.country),
    data.segments.map((r) => r.segment),
    data.signals.map((r) => r.id),
    data.customers.map((r) => r.ref),
  ]) {
    if (new Set(list).size !== list.length)
      throw new Error('Duplicate retention group');
  }
  const groups = new Map<string, number>();
  for (const customer of data.customers) {
    const key = JSON.stringify([customer.country, customer.band]);
    groups.set(key, (groups.get(key) ?? 0) + 1);
    if (
      customer.band === 'none' ||
      !customer.signals.length ||
      customer.signals.some(
        (id) =>
          ![
            'inactive',
            'declining',
            'unresolved',
            'repeated',
            'low_csat',
            'negative_sentiment',
            'cancellation',
          ].includes(id),
      )
    )
      throw new Error('Invalid shortlist signals');
  }
  if (
    data.countries.some(
      (r) => r.high + r.medium + r.watch + r.none !== r.total,
    ) ||
    data.segments.some((r) => r.high > r.total) ||
    [...groups.values()].some((n) => n > 15) ||
    data.customers.length > 900 ||
    data.signals.some((r) => r.total > m.eligibleCustomers)
  )
    throw new Error('Invalid retention limits');
  return data;
}

export function parseLiveFraud(
  rows: Record<string, string | null>[],
): Pick<
  FraudSnapshot['dataset'],
  | 'total'
  | 'fraud'
  | 'nullIds'
  | 'nullLabels'
  | 'duplicates'
  | 'dateRange'
  | 'countries'
  | 'channels'
  | 'types'
  | 'currencies'
  | 'monthly'
  | 'quality'
> {
  const numeric = (value: string | null) =>
    count.parse(value === null ? NaN : Number(value));
  const summaries = rows.filter((r) => r.section === 'summary');
  if (summaries.length !== 1) throw new Error('Missing fraud summary');
  const s = summaries[0];
  const total = numeric(s.total),
    fraud = numeric(s.fraud);
  const segment = (section: string) =>
    rows
      .filter((r) => r.section === section)
      .map((r) => ({
        label: r.label ?? 'Unknown',
        total: numeric(r.total),
        fraud: numeric(r.fraud),
      }))
      .sort((a, b) => b.total - a.total);
  const data = {
    total,
    fraud,
    nullIds: numeric(s.null_ids),
    nullLabels: numeric(s.null_labels),
    duplicates: null,
    dateRange: { min_date: s.min_date ?? '', max_date: s.max_date ?? '' },
    countries: segment('countries'),
    channels: segment('channels'),
    types: segment('types'),
    currencies: segment('currencies'),
    monthly: segment('monthly')
      .map((r) => ({ month: r.label, total: r.total, fraud: r.fraud }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    quality: [
      { id: 'merchant_category', missing: numeric(s.merchant_missing), total },
      { id: 'amount_usd_raw', missing: numeric(s.usd_missing), total },
      {
        id: 'amount_usd_normalized',
        missing: numeric(s.normalized_missing),
        total,
      },
      { id: 'labels', missing: numeric(s.null_labels), total },
      { id: 'ids', missing: numeric(s.null_ids), total },
    ],
  };
  if (
    !total ||
    fraud > total ||
    !s.min_date ||
    !s.max_date ||
    s.max_date.slice(0, 10) >= '2026-01-01' ||
    s.min_date > s.max_date
  )
    throw new Error('Invalid fraud cohort');
  for (const list of [
    data.countries,
    data.channels,
    data.types,
    data.currencies,
    data.monthly,
  ]) {
    if (
      list.reduce((n, r) => n + r.total, 0) !== total ||
      list.reduce((n, r) => n + r.fraud, 0) !== fraud
    )
      throw new Error('Fraud aggregate mismatch');
  }
  if (data.quality.some((q) => q.missing > total))
    throw new Error('Invalid missingness');
  return data;
}

// ANALYTICS_SOURCE=snapshot reads the warehouse result stored in Postgres, for
// deployments without Databricks; it is still the Databricks SQL result.
const analyticsQuery = (name: SnapshotName, statement: string) =>
  process.env.ANALYTICS_SOURCE === 'snapshot'
    ? analyticsSnapshotQuery(name)
    : analyticsWarehouseQuery(statement);

const retentionCache = new AnalyticsCache(async () => {
  const started = Date.now();
  const result = await analyticsQuery('retention', RETENTION_SQL);
  return {
    data: parseRetention(result.rows),
    statementId: result.statementId,
    durationMs: Date.now() - started,
  };
});
const fraudCache = new AnalyticsCache(async () => {
  const started = Date.now();
  const result = await analyticsQuery('fraud_live', FRAUD_LIVE_SQL);
  return {
    data: parseLiveFraud(result.rows),
    statementId: result.statementId,
    durationMs: Date.now() - started,
  };
});
function source<T extends { statementId: string; durationMs: number }>(
  cache: ReturnType<AnalyticsCache<T>['read']>,
  tables: string[],
): AnalyticsSource {
  const { data, ...state } = cache;
  return {
    ...state,
    status: state.status as AnalyticsSource['status'],
    provider: 'databricks_sql',
    tables,
    statementId: data?.statementId ?? null,
    durationMs: data?.durationMs ?? null,
  };
}
export function retentionDashboard(force = false): RetentionResponse {
  const cached = retentionCache.read(force);
  return {
    data: cached.data?.data ?? null,
    source: source(cached, [
      'workspace.bank_gold.customer_360',
      'workspace.bank_gold.customer_transactions',
      'workspace.bank_gold.customer_cases',
      'workspace.bank_gold.interaction_history',
    ]),
  };
}
export function liveFraudDashboard(snapshot: FraudSnapshot, force = false) {
  const cached = fraudCache.read(force);
  const s = source(cached, ['workspace.bank_silver.transactions']);
  return {
    snapshot: cached.data
      ? {
          ...snapshot,
          dataset: {
            ...snapshot.dataset,
            ...cached.data.data,
            scope: 'training_validation' as const,
            profiledAt: s.updatedAt!.slice(0, 10),
            deltaVersion: null,
          },
        }
      : snapshot,
    source: s,
  };
}
