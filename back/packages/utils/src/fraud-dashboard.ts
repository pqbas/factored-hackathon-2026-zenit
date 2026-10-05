/** Aggregate-only admin contract. Rates are fractions, never percentages. */
export interface FraudMetrics {
  rows: number;
  fraud: number;
  alerts: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  precision: number;
  recall: number;
  average_precision: number;
  roc_auc: number;
  alert_rate: number;
}
export interface FraudSegment {
  label: string;
  total: number;
  fraud: number;
}
export interface FraudSnapshot {
  schemaVersion: number;
  publishedAt: string;
  dataset: {
    source: string;
    deltaVersion: number;
    profiledAt: string;
    total: number;
    fraud: number;
    nullIds: number;
    nullLabels: number;
    duplicates: number;
    dateRange: { min_date: string; max_date: string };
    countries: FraudSegment[];
    channels: FraudSegment[];
    types: FraudSegment[];
    currencies: { label: string; total: number }[];
    monthly: { month: string; total: number; fraud: number }[];
    quality: { id: string; missing: number; total: number }[];
    audit: {
      before: string;
      auditedAt: string;
      transactions: number;
      registrationAfter: number;
      openingAfter: number;
      digitalEvents: number;
      digitalUnlinked: number;
      processingBefore: number;
    };
  };
  model: {
    version: string;
    algorithm: string;
    threshold: number;
    source: string;
    deltaVersion: number;
    runId: string;
    validationFrom: string;
    validationTo: string;
    experimental: boolean;
    automaticDecisionsEnabled: boolean;
    finalTestUsed: boolean;
    versions: {
      id: string;
      metrics: FraudMetrics;
      role: string;
      sourceLayer: string;
      runId: string;
    }[];
    monthly: { month: string; v7: FraudMetrics; v9: FraudMetrics }[];
    digitalCoverage: { id: string; covered: number; total: number }[];
  };
  evidence: { path: string; sha256: string }[];
}
export interface FraudOperational {
  status: 'available' | 'unavailable' | 'error';
  total: number;
  scored: number;
  alerts: number;
  unavailable: number;
  open: number;
  closed: number;
  byDay: { day: string; total: number; scored: number; alerts: number }[];
  byType: { type: string; total: number }[];
  scoreBins: { bin: number; total: number }[];
}
export interface FraudDashboard {
  snapshot: FraudSnapshot;
  window: { from: string; to: string; tz: string };
  refreshedAt: string;
  operational: FraudOperational;
}
