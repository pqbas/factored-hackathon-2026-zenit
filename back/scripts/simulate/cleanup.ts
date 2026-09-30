/**
 * Undoes a simulated day: deletes its chats through the back's API (as their
 * owner, by chatId from the record of the day) and its rows in
 * bank_sessions.sim_sessions.
 *
 *   npm run simulate:cleanup -- --day 2026-09-30 --base <url> [--allow-prod]
 *   npm run simulate:cleanup -- --file scripts/simulate/runs/<file>.json --base <url>
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type CleanupArgs, parseCleanupArgs } from './args';
import { identities, openLakebase } from './common';

const HERE = dirname(fileURLToPath(import.meta.url));

async function main(args: CleanupArgs) {
  const file = args.file ?? join(HERE, 'runs', `${args.day}.json`);
  const record = JSON.parse(readFileSync(file, 'utf8')) as {
    day: string;
    conversations: Array<{ chatId?: string; token?: string }>;
  };
  const chatIds = [
    ...new Set(record.conversations.map((c) => c.chatId).filter(Boolean)),
  ] as string[];

  const ids = identities(args.base);
  let deleted = 0;
  for (const id of chatIds) {
    const response = await fetch(`${args.base}/api/chat/${id}`, {
      method: 'DELETE',
      headers: ids.customer(),
    });
    if (response.ok) deleted++;
    else console.warn(`${id}: HTTP ${response.status}`);
  }
  console.log(`Deleted ${deleted}/${chatIds.length} chats`);

  const sql = openLakebase();
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
