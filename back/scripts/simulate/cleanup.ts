/**
 * Undoes a simulated day: deletes its chats through the back's API (as their
 * owner) and its rows in bank_sessions.sim_sessions. The chats come from the
 * record of the day and, with --day, also from the database: the chats of the
 * day's simulated customers created since their sessions, so an interrupted
 * run (no record, or a chat cut half way) leaves nothing behind.
 *
 *   npm run simulate:cleanup -- --day 2026-09-30 --base <url> [--allow-prod]
 *   npm run simulate:cleanup -- --file scripts/simulate/runs/<file>.json --base <url>
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CleanupArgs, parseCleanupArgs } from './args';
import { identities, openLakebase } from './common';

const HERE = dirname(fileURLToPath(import.meta.url));

async function main(args: CleanupArgs) {
  const file = args.file ?? join(HERE, 'runs', `${args.day}.json`);
  const record = existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as {
        day: string;
        conversations: Array<{ chatId?: string; token?: string }>;
      })
    : { day: args.day as string, conversations: [] };
  if (args.file && !record.conversations.length) {
    throw new Error(`${file} has no conversations`);
  }
  const chatIds = new Set(
    record.conversations.map((c) => c.chatId).filter(Boolean) as string[],
  );

  const sql = openLakebase();
  if (!args.file) {
    try {
      // The chat table lives next to bank_sessions in prod's instance.
      const rows = await sql<{ id: string }[]>`
        SELECT c.id FROM ai_chatbot."Chat" c
        JOIN (
          SELECT customer_id, min(created_at) AS since
          FROM bank_sessions.sim_sessions
          WHERE day = ${record.day}::date AND token LIKE 'sim-%'
          GROUP BY customer_id
        ) s ON s.customer_id = c."customerId"
        WHERE c."createdAt" >= s.since AT TIME ZONE 'UTC'`;
      for (const r of rows) chatIds.add(r.id);
    } catch (error) {
      console.warn(
        `Could not look up the day's chats in the database (${error instanceof Error ? error.message : error}); using the record only.`,
      );
    }
  }

  const ids = await identities(args.base);
  let deleted = 0;
  for (const id of chatIds) {
    const response = await fetch(`${args.base}/api/chat/${id}`, {
      method: 'DELETE',
      headers: ids.customer(),
    });
    if (response.ok) deleted++;
    else console.warn(`${id}: HTTP ${response.status}`);
  }
  console.log(`Deleted ${deleted}/${chatIds.size} chats`);

  try {
    // --day: every session of the day. --file: only the ones of that record
    // (a labeled run shares its day with others).
    const tokens = record.conversations
      .map((c) => c.token)
      .filter((t): t is string => Boolean(t?.startsWith('sim-')));
    const rows = args.file
      ? await sql`
          DELETE FROM bank_sessions.sim_sessions
          WHERE token = ANY(${tokens}::text[]) AND token LIKE 'sim-%'
          RETURNING token`
      : await sql`
          DELETE FROM bank_sessions.sim_sessions
          WHERE day = ${record.day}::date AND token LIKE 'sim-%'
          RETURNING token`;
    console.log(`Deleted ${rows.length} sessions of ${record.day}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(parseCleanupArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
