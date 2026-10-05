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
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type postgres from 'postgres';
import {
  type BackfillArgs,
  assertLocalDatabase,
  backfillFileName,
  parseBackfillArgs,
} from './args';
import {
  type BackfillItem,
  type CustomerFacts,
  attachCustomers,
  buildBackfillPlan,
  handoffReasonFor,
  messagesFor,
  quotasFor,
} from './backfill-plan';
import { openLakebase } from './common';
import { type SimCustomer, seededRandom } from './conversations';
import { pickCustomers } from './pick';

const HERE = dirname(fileURLToPath(import.meta.url));
export const BACKFILL_USER = 'demo-backfill';

type Sql = postgres.Sql;
type Row = Record<string, string | number | null>;

const ROLE = {
  customer: 'user',
  ai_agent: 'assistant',
  human_agent: 'assistant',
  system: 'system',
} as const;

// Stored timestamps are UTC wall-clock time (timestamp without time zone).
const utc = (d: Date) => d.toISOString().replace('T', ' ').replace('Z', '');

function summarizePlan(items: BackfillItem[]) {
  const perDay: Record<string, Record<string, number>> = {};
  for (const item of items) {
    perDay[item.day] ??= { total: 0, ai: 0, assisted: 0, human: 0 };
    perDay[item.day].total++;
    perDay[item.day][item.category]++;
  }
  return perDay;
}

async function factsOf(sql: Sql, customers: SimCustomer[]) {
  const ids = customers.map((c) => c.customerId);
  const names = (await sql`
    SELECT customer_id, first_name, last_name FROM bank_ro.customer_360
    WHERE customer_id = ANY(${ids}::text[])`) as unknown as Row[];
  const products = (await sql`
    SELECT customer_id, product_type, product_number_last4,
           current_balance::float8 AS balance, credit_limit::float8 AS credit_limit, currency
    FROM bank_ro.customer_products
    WHERE customer_id = ANY(${ids}::text[])
      AND product_status = 'Active'
      AND product_type IN ('Tarjeta Crédito', 'Cuenta Ahorro')
      AND coalesce(product_number_last4, '') <> ''`) as unknown as Row[];
  const facts = new Map<string, CustomerFacts>();
  for (const c of customers) {
    const n = names.find((r) => r.customer_id === c.customerId);
    const last4 = c.cardLast4 ?? c.savingsLast4;
    const kind = c.cardLast4 ? 'card' : 'savings';
    const p = products.find(
      (r) =>
        r.customer_id === c.customerId &&
        r.product_number_last4 === last4 &&
        r.product_type === (kind === 'card' ? 'Tarjeta Crédito' : 'Cuenta Ahorro'),
    );
    facts.set(c.customerId, {
      customerId: c.customerId,
      name: [n?.first_name, n?.last_name].filter(Boolean).join(' ') || c.firstName,
      product: last4
        ? {
            kind,
            last4,
            balance: p?.balance == null ? null : Number(p.balance),
            limit: p?.credit_limit == null ? null : Number(p.credit_limit),
            currency: String(p?.currency ?? ''),
          }
        : null,
      charge: c.charge,
      caseCategory: c.cases[0]?.category ?? null,
    });
  }
  return facts;
}

export async function insertBackfill(
  sql: Sql,
  rows: Array<{ item: BackfillItem; facts: CustomerFacts }>,
): Promise<string[]> {
  const chatIds: string[] = [];
  await sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    for (const { item, facts } of rows) {
      const chatId = randomUUID();
      const messages = messagesFor(item, facts);
      const closedAt = messages[messages.length - 1].at;
      const hadHuman = item.category !== 'ai';
      await tx`
        INSERT INTO ai_chatbot."Chat"
          (id, "createdAt", title, "userId", visibility, "handledBy", "useCase",
           language, "closedAt", "hadHuman", "customerId", "customerName")
        VALUES (${chatId}, ${utc(item.startedAt)}::timestamp,
          ${`[demo] ${messages[0].text}`.slice(0, 120)}, ${BACKFILL_USER},
          'private', 'ai_agent', ${item.useCase}, ${item.language},
          ${utc(closedAt)}::timestamp, ${hadHuman}, ${facts.customerId}, ${facts.name})`;
      for (const m of messages) {
        await tx`
          INSERT INTO ai_chatbot."Message"
            (id, "chatId", role, parts, attachments, "createdAt", blocked,
             "senderType", "senderId")
          VALUES (${randomUUID()}, ${chatId}, ${ROLE[m.sender]},
            ${JSON.stringify([{ type: 'text', text: m.text }])}::json, '[]'::json,
            ${utc(m.at)}::timestamp, false, ${m.sender},
            ${m.sender === 'human_agent' ? 'asesor@demo.example' : null})`;
      }
      if (hadHuman) {
        const handedAt = messages.find((m) => m.sender === 'system')?.at ?? item.startedAt;
        await tx`
          INSERT INTO ai_chatbot."Handoff"
            (id, "chatId", reason, summary, "createdAt", "resolvedAt")
          VALUES (${randomUUID()}, ${chatId}, ${handoffReasonFor(item.useCase)},
            ${`[demo] ${messages[0].text}`}, ${utc(handedAt)}::timestamp,
            ${utc(closedAt)}::timestamp)`;
      }
      await tx`
        INSERT INTO ai_chatbot."ResolutionEvent"
          (id, "chatId", "resolvedBy", "hadHuman", "useCase", "resolvedAt")
        VALUES (${randomUUID()}, ${chatId},
          ${item.category === 'human' ? 'human' : 'ai'}, ${hadHuman},
          ${item.useCase}, ${utc(closedAt)}::timestamp)`;
      chatIds.push(chatId);
    }
  });
  return chatIds;
}

// Only rows of the file's chats that are demo-backfill chats.
export async function deleteBackfill(sql: Sql, chatIds: string[]) {
  return sql.begin(async (transaction) => {
    const tx = transaction as unknown as Sql;
    const ids = (
      (await tx`
        SELECT id FROM ai_chatbot."Chat"
        WHERE id = ANY(${chatIds}::uuid[]) AND "userId" = ${BACKFILL_USER}`) as unknown as Row[]
    ).map((r) => String(r.id));
    await tx`DELETE FROM ai_chatbot."ResolutionEvent" WHERE "chatId" = ANY(${ids}::uuid[])`;
    await tx`DELETE FROM ai_chatbot."Handoff" WHERE "chatId" = ANY(${ids}::uuid[])`;
    await tx`DELETE FROM ai_chatbot."Message" WHERE "chatId" = ANY(${ids}::uuid[])`;
    await tx`DELETE FROM ai_chatbot."Chat" WHERE id = ANY(${ids}::uuid[])`;
    return ids.length;
  });
}

export async function pickForPlan(sql: Sql, items: BackfillItem[], seed: string) {
  const used = (
    (await sql`
      SELECT DISTINCT "customerId" FROM ai_chatbot."Chat"
      WHERE "userId" = ${BACKFILL_USER} AND "customerId" IS NOT NULL`) as unknown as Row[]
  ).map((r) => String(r.customerId));
  const { assignments, shortfall } = await pickCustomers(
    sql,
    quotasFor(items),
    seededRandom(seed)() * 2 - 1,
    used,
  );
  if (Object.keys(shortfall).length > 0) {
    throw new Error(`Not enough eligible customers: ${JSON.stringify(shortfall)}`);
  }
  const paired = attachCustomers(items, assignments);
  const facts = await factsOf(sql, paired.map((p) => p.customer));
  return paired.map((p) => ({
    item: p.item,
    facts: facts.get(p.customer.customerId) as CustomerFacts,
  }));
}

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
