import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import postgres from 'postgres';
import {
  BACKFILL_USER,
  deleteBackfill,
  insertBackfill,
  pickForPlan,
} from '../../scripts/simulate/backfill-db';
import { buildBackfillPlan } from '../../scripts/simulate/backfill-plan';

// simulate:backfill against a throwaway database in the local test Postgres
// (SIM_PG_URL, e.g. the Docker one on 127.0.0.1:55432): the bank fixture,
// 80 extra active customers so the picker has enough, and the real
// migrations. Skipped without SIM_PG_URL; it never touches Lakebase.
const URL_ = process.env.SIM_PG_URL;
const DB = 'backfill_it';
const BACK = join(dirname(require.resolve('../../package.json')));

test.describe('simulate:backfill on a local database', () => {
  test.skip(!URL_, 'needs SIM_PG_URL (local Postgres)');
  let sql: postgres.Sql;

  test.beforeAll(async () => {
    const base = new URL(URL_ as string);
    expect(['localhost', '127.0.0.1']).toContain(base.hostname);
    const admin = postgres({ ...pgOptions(base), database: 'postgres', max: 1, onnotice: () => {} });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await admin.unsafe(`CREATE DATABASE ${DB}`);
    await admin.end();

    sql = postgres({ ...pgOptions(base), database: DB, max: 2, onnotice: () => {} });
    await sql.unsafe(readFileSync(join(BACK, 'tests/fixtures/bank_ro.sql'), 'utf8'));
    await sql.unsafe(`
      INSERT INTO bank_ro.customer_360 (customer_id, first_name, last_name, country, customer_status)
      SELECT 'CLI-IT' || g, 'Nombre' || g, 'Apellido' || g, 'México', 'Active'
      FROM generate_series(1, 80) g;
      INSERT INTO bank_ro.customer_products
        (product_id, customer_id, product_type, product_status, currency,
         product_number_last4, current_balance, credit_limit)
      SELECT 'P-C' || g, 'CLI-IT' || g, 'Tarjeta Crédito', 'Active', 'MXN',
             lpad((1000 + g)::text, 4, '0'), 100 + g, 5000
      FROM generate_series(1, 80) g
      UNION ALL
      SELECT 'P-S' || g, 'CLI-IT' || g, 'Cuenta Ahorro', 'Active', 'MXN',
             lpad((2000 + g)::text, 4, '0'), 900 + g, NULL
      FROM generate_series(1, 80) g;
      INSERT INTO bank_ro.customer_transactions
        (transaction_id, customer_id, product_id, transaction_date, amount, currency, merchant_name)
      SELECT 'T' || g, 'CLI-IT' || g, 'P-C' || g, now() - interval '3 days', 50 + g, 'MXN', 'Comercio ' || g
      FROM generate_series(1, 80) g;
      INSERT INTO bank_ro.customer_cases (complaint_id, customer_id, creation_date, category, status)
      SELECT 'K' || g, 'CLI-IT' || g, now() - interval '9 days', 'Cobro indebido', 'Abierto'
      FROM generate_series(1, 80) g;
      CREATE SCHEMA IF NOT EXISTS ai_chatbot;
    `);
    const { drizzle } = await import('drizzle-orm/postgres-js');
    const { migrate } = await import('drizzle-orm/postgres-js/migrator');
    await migrate(drizzle(sql), {
      migrationsFolder: join(BACK, 'packages/db/migrations'),
    });
  });

  test.afterAll(async () => {
    await sql?.end({ timeout: 5 });
    if (!URL_) return;
    const admin = postgres({ ...pgOptions(new URL(URL_)), database: 'postgres', max: 1, onnotice: () => {} });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
    await admin.end();
  });

  test('inserts closed demo chats that the metrics count, and cleans them up', async () => {
    const items = buildBackfillPlan({ from: '2026-10-02', to: '2026-10-02' });
    const rows = await pickForPlan(sql, items, 'it');
    // Real customers only, never the demo ones, one per chat.
    expect(new Set(rows.map((r) => r.facts.customerId)).size).toBe(items.length);
    const chatIds = await insertBackfill(sql, rows);
    expect(chatIds).toHaveLength(items.length);

    // The same filters as getResolutionMetrics, grouped by Lima day.
    const metrics = await sql`
      SELECT to_char(("resolvedAt" at time zone 'UTC') at time zone 'America/Lima', 'YYYY-MM-DD') AS day,
             count(*) FILTER (WHERE "resolvedBy" = 'ai' AND NOT "hadHuman")::int AS ai,
             count(*) FILTER (WHERE "resolvedBy" = 'ai' AND "hadHuman")::int AS assisted,
             count(*) FILTER (WHERE "resolvedBy" = 'human')::int AS human
      FROM ai_chatbot."ResolutionEvent" GROUP BY 1`;
    expect(metrics).toHaveLength(1);
    expect(metrics[0].day).toBe('2026-10-02');
    expect(metrics[0].ai + metrics[0].assisted + metrics[0].human).toBe(items.length);
    expect(metrics[0].ai).toBeGreaterThan(0);
    expect(metrics[0].assisted).toBeGreaterThan(0);
    expect(metrics[0].human).toBeGreaterThan(0);

    // Closed, with David, out of the Bandeja; marked as demo.
    const [open] = await sql`
      SELECT count(*)::int AS n FROM ai_chatbot."Chat"
      WHERE "closedAt" IS NULL OR "handledBy" <> 'ai_agent'`;
    expect(open.n).toBe(0);
    const [marked] = await sql`
      SELECT count(*)::int AS n FROM ai_chatbot."Chat"
      WHERE "userId" = ${BACKFILL_USER} AND title LIKE '[demo]%'`;
    expect(marked.n).toBe(items.length);
    const [handoffs] = await sql`
      SELECT count(*) FILTER (WHERE "resolvedAt" IS NULL)::int AS open,
             count(*)::int AS total FROM ai_chatbot."Handoff"`;
    expect(handoffs.open).toBe(0);
    expect(handoffs.total).toBe(metrics[0].assisted + metrics[0].human);

    // A second run picks other customers.
    const again = await pickForPlan(sql, items.slice(0, 3), 'it-2');
    const first = new Set(rows.map((r) => r.facts.customerId));
    for (const r of again) expect(first.has(r.facts.customerId)).toBe(false);

    // Cleanup removes exactly those chats, and nothing that isn't demo-backfill.
    await sql`
      INSERT INTO ai_chatbot."Chat" (id, "createdAt", title, "userId")
      VALUES ('00000000-0000-4000-8000-000000000001', now(), 'real', 'someone')`;
    const deleted = await deleteBackfill(sql, [
      ...chatIds,
      '00000000-0000-4000-8000-000000000001',
    ]);
    expect(deleted).toBe(items.length);
    const [left] = await sql`
      SELECT (SELECT count(*) FROM ai_chatbot."ResolutionEvent")::int AS events,
             (SELECT count(*) FROM ai_chatbot."Message")::int AS messages,
             (SELECT count(*) FROM ai_chatbot."Chat")::int AS chats`;
    expect(left).toEqual({ events: 0, messages: 0, chats: 1 });
  });
});

function pgOptions(url: URL) {
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
  };
}
