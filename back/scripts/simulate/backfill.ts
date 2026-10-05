/**
 * Demo data for the resolution metrics on days with no traffic: closed chats
 * of real bank customers, backdated, each with its ResolutionEvent. The API
 * can't backdate (README, "No backdating"), so this writes to Lakebase.
 *
 *   npm run simulate:backfill -- --dry-run                       # the plan
 *   npm run simulate:backfill -- --from 2026-10-01 --to 2026-10-04 --allow-prod
 *   npm run simulate:backfill -- --cleanup --file scripts/simulate/runs/<file>.json --allow-prod
 *
 * Everything it writes has userId 'demo-backfill' and a "[demo]" title, and the
 * chat ids go to runs/backfill-<from>_<to>.json, which --cleanup reads.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type BackfillArgs,
  assertLocalDatabase,
  backfillFileName,
  parseBackfillArgs,
} from './args';
import {
  BACKFILL_USER,
  deleteBackfill,
  insertBackfill,
  pickForPlan,
  summarizePlan,
} from './backfill-db';
import { buildBackfillPlan, messagesFor } from './backfill-plan';
import { openLakebase } from './common';

const HERE = dirname(fileURLToPath(import.meta.url));
async function main(args: BackfillArgs) {
  const runsDir = join(HERE, 'runs');

  if (args.cleanup) {
    assertLocalDatabase(process.env.SIM_PG_URL, args.allowProd);
    const record = JSON.parse(readFileSync(args.file as string, 'utf8')) as {
      chatIds: string[];
    };
    const sql = openLakebase();
    try {
      const deleted = await deleteBackfill(sql, record.chatIds);
      console.log(`Deleted ${deleted}/${record.chatIds.length} demo chats`);
    } finally {
      await sql.end({ timeout: 5 });
    }
    return;
  }

  const items = buildBackfillPlan({ from: args.from, to: args.to, seed: args.seed });
  console.log(`Backfill ${args.from}..${args.to}: ${items.length} demo chats`);
  console.log(JSON.stringify(summarizePlan(items), null, 2));

  const file = join(runsDir, backfillFileName(args.from, args.to));
  if (!args.dryRun && existsSync(file)) {
    throw new Error(`${file} already exists: those days were backfilled`);
  }
  // A dry run without a database stops at the plan.
  if (args.dryRun && !args.allowProd && !process.env.SIM_PG_URL) {
    console.log('Dry run: plan only (no database to pick customers from).');
    return;
  }
  if (!args.dryRun) assertLocalDatabase(process.env.SIM_PG_URL, args.allowProd);

  const sql = openLakebase();
  try {
    const rows = await pickForPlan(sql, items, args.seed);
    if (args.dryRun) {
      for (const { item, facts } of rows.slice(0, 5)) {
        const msgs = messagesFor(item, facts);
        console.log(`- ${item.day} ${item.category} ${item.useCase ?? 'NONE'} ${facts.customerId}: ${msgs[0].text} / ${msgs[1].text}`);
      }
      console.log('Dry run: nothing written.');
      return;
    }
    const chatIds = await insertBackfill(sql, rows);
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(
      file,
      `${JSON.stringify({ from: args.from, to: args.to, seed: args.seed, userId: BACKFILL_USER, summary: summarizePlan(items), chatIds }, null, 2)}\n`,
    );
    console.log(`Inserted ${chatIds.length} demo chats; wrote ${file}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(parseBackfillArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
