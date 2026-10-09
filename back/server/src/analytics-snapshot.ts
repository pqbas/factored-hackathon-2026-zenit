import { bankQuery } from './bank-db';

// Dashboard rows taken once from the Databricks warehouse
// (scripts/snapshot-analytics.ts), for deployments without Databricks.
export const ANALYTICS_SNAPSHOT_TABLE = 'bank_ro.analytics_snapshot';

export type SnapshotName = 'fraud_live' | 'retention';

export async function analyticsSnapshotQuery(
  name: SnapshotName,
): Promise<{ statementId: string; rows: Record<string, string | null>[] }> {
  const [row] = await bankQuery(
    `SELECT statement_id, rows FROM ${ANALYTICS_SNAPSHOT_TABLE} WHERE name = $1`,
    [name],
  );
  if (!row?.statement_id || !row.rows)
    throw new Error(`Analytics snapshot ${name} not found`);
  return {
    statementId: row.statement_id,
    rows: JSON.parse(row.rows) as Record<string, string | null>[],
  };
}
