// What scripts/aws/migrate.sh needs to know before touching the database:
// how many migrations are pending and whether this identity may run them.
// Read-only. Prints one JSON line; exit 0 always (the caller decides).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { getConnectionUrl } from '@chat-template/db';

const here = dirname(fileURLToPath(import.meta.url));
const journal = JSON.parse(
  readFileSync(
    join(here, '../../packages/db/migrations/meta/_journal.json'),
    'utf8',
  ),
);

async function main() {
  const sql = postgres(await getConnectionUrl(), {
    max: 1,
    connection: { default_transaction_read_only: true },
  });
  try {
    const [{ applied }] = await sql`
      SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`;
    // Postgres lets only a table's owner (or a member of the owner role) alter
    // it, so a migration needs that on every table of the two schemas.
    const notOwned = await sql`
      SELECT n.nspname || '.' || c.relname AS name, pg_get_userbyid(c.relowner) AS owner
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('ai_chatbot', 'drizzle') AND c.relkind IN ('r', 'S')
        AND NOT pg_has_role(current_user, c.relowner, 'MEMBER')
      ORDER BY 1`;
    const [{ user }] = await sql`SELECT current_user AS user`;
    console.log(
      JSON.stringify({
        user,
        inRepo: journal.entries.length,
        applied,
        pending: journal.entries.length - applied,
        notOwned: notOwned.map((r) => `${r.name} (${r.owner})`),
      }),
    );
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
