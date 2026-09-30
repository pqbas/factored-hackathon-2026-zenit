import postgres from 'postgres';
import { expect, test } from '../fixtures';

// playwright.config.ts fills this database with tests/fixtures/bank_ro.sql.
const url =
  process.env.BANK_POSTGRES_URL ||
  'postgresql://postgres:postgres@127.0.0.1:55432/bank_fixture';

test('the bank_ro fixture has the seven synced tables', async () => {
  const sql = postgres(url, { max: 1 });
  try {
    const rows = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'bank_ro' AND table_type = 'BASE TABLE'
      ORDER BY table_name`;
    const names = rows.map((r) => r.table_name);
    for (const table of [
      'call_transcripts',
      'customer_360',
      'customer_cases',
      'customer_products',
      'customer_transactions',
      'interaction_history',
    ]) {
      expect(names).toContain(table);
    }
    // customers is a view over customers_rows (see the fixture).
    const [customers] = await sql`
      SELECT count(*)::int AS n FROM information_schema.views
      WHERE table_schema = 'bank_ro' AND table_name = 'customers'`;
    expect(customers.n).toBe(1);
  } finally {
    await sql.end();
  }
});
