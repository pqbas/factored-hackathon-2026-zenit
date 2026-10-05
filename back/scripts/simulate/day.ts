/**
 * One day of simulated traffic: `count` real bank customers, one conversation
 * each, against the back (locally or a deployed App). Handoffs are left waiting
 * in the queue: the simulation takes and releases nothing.
 *
 *   npm run simulate:day -- --count 100 --base <url> --allow-prod
 *   npm run simulate:day -- --count 5 --dry-run     # the plan, nothing sent
 *
 * Sessions live in bank_sessions.sim_sessions (Lakebase): one random sim-<uuid>
 * token per customer, expiring at the end of the day. The record of the day is
 * scripts/simulate/runs/<day>.json. simulate:cleanup undoes a day.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRICING_ASSUMPTIONS } from '../../server/src/pricing';
import { sendMessage } from '../simulate-customers';
import {
  advisorActions,
  type DayArgs,
  endOfDayUtc,
  parseDayArgs,
  runFileName,
} from './args';
import { identities, openLakebase } from './common';
import {
  allocateMix,
  buildPlan,
  type PlanItem,
  seededRandom,
} from './conversations';
import { pickCustomers } from './pick';
import {
  type ConversationRecord,
  estimateCostUpperBound,
  summarize,
  type TurnRecord,
} from './summary';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_COST_USD = 3;

type Ids = Awaited<ReturnType<typeof identities>>;

async function pool<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
) {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(size, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next++];
        await fn(item);
      }
    },
  );
  await Promise.all(workers);
}

async function get<T>(
  base: string,
  path: string,
  headers: Record<string, string>,
) {
  const response = await fetch(`${base}${path}`, { headers });
  if (!response.ok) {
    throw new Error(
      `GET ${path} -> HTTP ${response.status} ${(await response.text()).slice(0, 200)}`,
    );
  }
  return (await response.json()) as T;
}

type ChatView = {
  closedAt: string | null;
  handledBy?: string | null;
  handoff: { reason: string } | null;
};
type ApiTurn = {
  messageId: string | null;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  handoffReason: string | null;
};

async function runConversation(
  base: string,
  ids: Ids,
  item: PlanItem,
  token: string,
): Promise<{
  record: ConversationRecord;
  sent: Array<{ id: string; runnerMs: number }>;
}> {
  const chatId = randomUUID();
  const record: ConversationRecord = {
    customerId: item.customer.customerId,
    motive: item.motive,
    language: item.language,
    chatId,
    token,
    handoffReason: null,
    handledBy: null,
    closed: false,
    turns: [],
  };
  const sent: Array<{ id: string; runnerMs: number }> = [];
  try {
    for (const text of item.messages) {
      const result = await sendMessage(
        base,
        ids.customer(),
        chatId,
        text,
        token,
      );
      if (
        result.reply.startsWith('[HTTP') ||
        result.reply.startsWith('[error]')
      ) {
        throw new Error(result.reply);
      }
      sent.push({ id: result.messageId, runnerMs: result.durationMs });
      record.turns.push({
        step: sent.length - 1,
        runnerMs: result.durationMs,
        backMs: null,
        inputTokens: null,
        outputTokens: null,
        handoffReason: null,
      });
      // After a handoff David stays silent: the rest would go unanswered.
      const chat = await get<ChatView>(
        base,
        `/api/advisor/conversations/${chatId}`,
        ids.admin(),
      );
      if (chat.handoff || chat.closedAt) break;
    }
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
  }
  return { record, sent };
}

async function post(
  base: string,
  path: string,
  headers: Record<string, string>,
  body?: unknown,
) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `POST ${path} -> HTTP ${response.status} ${(await response.text()).slice(0, 200)}`,
    );
  }
}

const THANKS = { es: 'gracias, eso es todo', pt: 'obrigado, é só isso' };

// --advisor-share: the advisor takes the handoff and resolves it (→ human),
// or hands it back and the customer says goodbye so David closes it
// (→ assisted).
async function advise(
  base: string,
  ids: Ids,
  record: ConversationRecord,
  action: 'resolved' | 'returned',
) {
  const path = `/api/advisor/conversations/${record.chatId}`;
  await post(base, `${path}/take`, ids.admin());
  await post(base, `${path}/release`, ids.admin(), {
    outcome: action === 'resolved' ? 'resolved' : 'returned_to_agent',
  });
  if (action === 'returned') {
    await sendMessage(
      base,
      ids.customer(),
      record.chatId,
      THANKS[record.language],
      record.token,
    );
  }
  record.advisor = action;
}

async function readState(base: string, ids: Ids, record: ConversationRecord) {
  const chat = await get<ChatView>(
    base,
    `/api/advisor/conversations/${record.chatId}`,
    ids.admin(),
  );
  record.handoffReason = chat.handoff?.reason ?? record.handoffReason;
  record.handledBy = chat.handledBy ?? null;
  record.closed = Boolean(chat.closedAt);
}

async function main(args: DayArgs) {
  const mix = allocateMix(args.count);
  const bound = estimateCostUpperBound(args.count);
  console.log(
    `Day ${args.day}: ${args.count} conversations against ${args.base} (upper bound ~${bound.toFixed(2)} USD)`,
  );
  console.log(`Mix: ${JSON.stringify(mix)}`);
  if (bound > MAX_COST_USD && !args.force) {
    throw new Error(
      `Estimated cost upper bound ${bound.toFixed(2)} USD is over ${MAX_COST_USD}; use --force to run anyway`,
    );
  }

  const runsDir = join(HERE, 'runs');
  const file = join(runsDir, runFileName(args.day, args.label));
  if (existsSync(file) && !args.dryRun) {
    throw new Error(
      `${file} already exists: pass --label <name> to write ${runFileName(args.day, 'name')} instead`,
    );
  }

  const sql = openLakebase();
  try {
    // A stable seed per day: the same day picks and plans the same way.
    const daySeed = seededRandom(args.day)() * 2 - 1;
    const { assignments, shortfall } = await pickCustomers(sql, mix, daySeed);
    const plan = buildPlan(assignments, args.day);
    const pt = plan.filter((p) => p.language === 'pt').length;
    console.log(`Picked ${plan.length} customers, ${pt} in pt.`);
    if (Object.keys(shortfall).length > 0) {
      const text = `Not enough eligible customers: ${JSON.stringify(shortfall)}`;
      if (!args.dryRun) throw new Error(text);
      console.warn(`WARNING ${text}`);
    }

    if (args.dryRun) {
      for (const p of plan.slice(0, 5)) {
        console.log(
          `- ${p.motive} ${p.language} ${p.customer.customerId}: ${JSON.stringify(p.messages)}`,
        );
      }
      const perMotive: Record<string, number> = {};
      for (const p of plan)
        perMotive[p.motive] = (perMotive[p.motive] ?? 0) + 1;
      console.log(`Plan per motive: ${JSON.stringify(perMotive)}`);
      console.log('Dry run: no sessions created, nothing sent.');
      return;
    }

    // Sessions first: one per customer, expiring at the end of the day.
    const expiresAt = endOfDayUtc(args.day);
    const tokens = plan.map(() => `sim-${randomUUID()}`);
    await sql`
      INSERT INTO bank_sessions.sim_sessions (token, customer_id, country, expires_at, day)
      SELECT * FROM unnest(
        ${tokens}::text[],
        ${plan.map((p) => p.customer.customerId)}::text[],
        ${plan.map((p) => p.customer.country)}::text[],
        ${plan.map(() => expiresAt.toISOString())}::timestamptz[],
        ${plan.map(() => args.day)}::date[]
      )`;
    console.log(
      `Created ${tokens.length} sessions (expire ${expiresAt.toISOString()}).`,
    );

    mkdirSync(runsDir, { recursive: true });
    const ids = await identities(args.base);
    const results: Array<Awaited<ReturnType<typeof runConversation>>> = [];
    const flush = (extra: Record<string, unknown> = {}) =>
      writeFileSync(
        file,
        `${JSON.stringify(
          {
            day: args.day,
            base: args.base,
            pricing: PRICING_ASSUMPTIONS,
            summary: summarize(results.map((r) => r.record)),
            ...extra,
            conversations: results.map((r) => r.record),
          },
          null,
          2,
        )}\n`,
      );

    // An interrupted run keeps what it did: simulate:cleanup needs it.
    const onSignal = (signal: NodeJS.Signals) => {
      flush({ partial: true, interrupted: signal });
      console.error(`\nInterrupted (${signal}): wrote ${file}`);
      process.exit(130);
    };
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    flush({ partial: true });

    try {
      let done = 0;
      await pool(
        plan.map((p, i) => ({ p, token: tokens[i] })),
        args.concurrency,
        async ({ p, token }) => {
          const result = await runConversation(args.base, ids, p, token);
          results.push(result);
          flush({ partial: true });
          done++;
          if (done % 10 === 0 || done === plan.length) {
            console.log(`  ${done}/${plan.length} conversations`);
          }
        },
      );

      // Handoffs stay in the queue unless --advisor-share hands some to an
      // advisor.
      for (const r of results) {
        try {
          await readState(args.base, ids, r.record);
        } catch (error) {
          r.record.error ??=
            error instanceof Error ? error.message : String(error);
        }
      }
      const waiting = results.filter(
        (r) => r.record.handoffReason && !r.record.closed && !r.record.error,
      );
      const actions = advisorActions(waiting.length, args.advisorShare);
      for (const [i, r] of waiting.entries()) {
        const action = actions[i];
        if (!action) continue;
        try {
          await advise(args.base, ids, r.record, action);
        } catch (error) {
          r.record.error ??=
            error instanceof Error ? error.message : String(error);
        }
      }
      // Turn metrics of the back.
      for (const r of results) {
        try {
          await readState(args.base, ids, r.record);
          const { turns } = await get<{ turns: ApiTurn[] }>(
            args.base,
            `/api/advisor/conversations/${r.record.chatId}/turns`,
            ids.admin(),
          );
          r.record.turns = r.sent.map((s, step): TurnRecord => {
            const row = turns.find((t) => t.messageId === s.id);
            return {
              step,
              runnerMs: s.runnerMs,
              backMs: row?.durationMs ?? null,
              inputTokens: row?.inputTokens ?? null,
              outputTokens: row?.outputTokens ?? null,
              handoffReason: row?.handoffReason ?? null,
            };
          });
        } catch (error) {
          r.record.error ??=
            error instanceof Error ? error.message : String(error);
        }
      }
    } finally {
      // Keep the chatIds and tokens even when the run breaks half way:
      // simulate:cleanup reads them.
      flush();
    }

    const summary = summarize(results.map((r) => r.record));
    console.log(`\nWrote ${file}`);
    console.log(JSON.stringify(summary, null, 2));
    console.log(
      'Note: the dataset has no customers from Brazil; the pt conversations are customers from México, Colombia and Argentina who write in Portuguese.',
    );
    console.log(PRICING_ASSUMPTIONS);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(parseDayArgs(process.argv.slice(2))).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
