export type RetentionBand = 'high' | 'medium' | 'watch' | 'none';
export interface AnalyticsSource {
  provider: 'databricks_sql';
  tables: string[];
  status: 'fresh' | 'stale' | 'loading' | 'unavailable';
  updating: boolean;
  updatedAt: string | null;
  lastAttemptAt: string | null;
  lastRefreshFailed: boolean;
  cacheSeconds: number;
  statementId: string | null;
  durationMs: number | null;
}
export interface RetentionCustomer {
  ref: string;
  country: string;
  segment: string;
  band: RetentionBand;
  signals: string[];
  inactiveDays: number | null;
  tx30: number;
  txPrevious30: number;
  openCases: number;
  csat: number | null;
  csatResponses: number;
  families: number;
}
export interface RetentionData {
  ruleVersion: string;
  asOf: string;
  totalCustomers: number;
  eligibleCustomers: number;
  activityUnknown: number;
  bands: { band: RetentionBand; total: number }[];
  countries: {
    country: string;
    total: number;
    high: number;
    medium: number;
    watch: number;
    none: number;
  }[];
  segments: { segment: string; total: number; high: number }[];
  signals: { id: string; total: number }[];
  customers: RetentionCustomer[];
  perCountryBandLimit: number;
}
export interface RetentionResponse {
  data: RetentionData | null;
  source: AnalyticsSource;
}
