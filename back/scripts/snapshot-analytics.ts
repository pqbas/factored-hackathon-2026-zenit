// Runs the fraud and retention dashboard SQL once on the Databricks warehouse
// and stores the result rows, as text, in the bank Postgres. With
// ANALYTICS_SOURCE=snapshot the dashboards read these rows instead of the
// warehouse, so they keep working without Databricks.
//
//   BANK_POSTGRES_URL=... npx tsx scripts/snapshot-analytics.ts
import postgres from 'postgres';
import { analyticsWarehouseQuery } from '../server/src/analytics-warehouse';
import { FRAUD_LIVE_SQL } from '../server/src/fraud-live-sql';
import { RETENTION_SQL } from '../server/src/retention-sql';
import { ANALYTICS_SNAPSHOT_TABLE } from '../server/src/analytics-snapshot';

const url = process.env.BANK_POSTGRES_URL;
if (!url) throw new Error('BANK_POSTGRES_URL must be set');
const sql = postgres(url, { max: 1 });

async function main() {
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS ${ANALYTICS_SNAPSHOT_TABLE} (
    name text PRIMARY KEY,
    statement_id text NOT NULL,
    rows jsonb NOT NULL,
    taken_at timestamptz NOT NULL DEFAULT now()
  )`);

  for (const [name, statement] of [
    ['fraud_live', FRAUD_LIVE_SQL],
    ['retention', RETENTION_SQL],
  ] as const) {
    const { statementId, rows } = await analyticsWarehouseQuery(statement);
    await sql`
      INSERT INTO ${sql.unsafe(ANALYTICS_SNAPSHOT_TABLE)} (name, statement_id, rows)
      VALUES (${name}, ${statementId}, ${sql.json(rows)})
      ON CONFLICT (name) DO UPDATE
      SET statement_id = EXCLUDED.statement_id, rows = EXCLUDED.rows, taken_at = now()`;
    console.log(`${name}: ${rows.length} rows (statement ${statementId})`);
  }
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
