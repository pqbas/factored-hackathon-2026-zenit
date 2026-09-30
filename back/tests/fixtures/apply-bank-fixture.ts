import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import postgres from 'postgres';

// Applies tests/fixtures/bank_ro.sql to the database of BANK_POSTGRES_URL,
// creating the database first when it doesn't exist (default: bank_fixture in
// the Docker Postgres of the tests). Run by playwright.config.ts.
const DEFAULT_URL =
  'postgresql://postgres:postgres@127.0.0.1:55432/bank_fixture';

async function main() {
  const url = new URL(process.env.BANK_POSTGRES_URL || DEFAULT_URL);
  const database = decodeURIComponent(url.pathname.slice(1));

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const adminSql = postgres(admin.toString(), { max: 1, connect_timeout: 10 });
  try {
    const found =
      await adminSql`SELECT 1 FROM pg_database WHERE datname = ${database}`;
    if (found.length === 0) {
      await adminSql.unsafe(
        `CREATE DATABASE "${database.replace(/"/g, '""')}"`,
      );
    }
  } finally {
    await adminSql.end();
  }

  const sql = postgres(url.toString(), { max: 1, connect_timeout: 10 });
  try {
    const here = dirname(process.argv[1]);
    await sql.unsafe(readFileSync(join(here, 'bank_ro.sql'), 'utf8'));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error('[bank fixture] Could not apply bank_ro.sql:', error.message);
  process.exit(1);
});
