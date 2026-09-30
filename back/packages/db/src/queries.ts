import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  chat,
  message,
  resolutionEvent,
  agentTurn,
  handoff,
  turnMetric,
  type AgentTurn,
  type TurnMetric,
  type Handoff,
  type DBMessage,
  type Chat,
} from './schema';
import type { VisibilityType } from '@chat-template/utils';
import { ChatSDKError } from '@chat-template/core/errors';
import type { LanguageModelV3Usage } from '@ai-sdk/provider';
import { isDatabaseAvailable } from './connection';
import { getAuthMethod, getAuthMethodDescription } from '@chat-template/auth';

// Re-export User type for external use
export type { User } from './schema';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle
let _db: ReturnType<typeof drizzle>;

const getOrInitializeDb = async () => {
  if (!isDatabaseAvailable()) {
    throw new Error(
      'Database configuration required. Please set PGDATABASE/PGHOST/PGUSER or POSTGRES_URL environment variables.',
    );
  }

  if (_db) return _db;

  const authMethod = getAuthMethod();
  if (authMethod === 'oauth' || authMethod === 'cli') {
    // Dynamic auth path - db will be initialized asynchronously
    console.log(
      `Using ${getAuthMethodDescription()} authentication for Postgres connection`,
    );
  } else if (process.env.POSTGRES_URL) {
    // Traditional connection string
    const client = postgres(process.env.POSTGRES_URL);
    _db = drizzle(client);
  }

  return _db;
};

// Helper to ensure db is initialized for dynamic auth connections
async function ensureDb() {
  const db = await getOrInitializeDb();
  // Always get a fresh DB instance for dynamic auth connections to handle token expiry
  const authMethod = getAuthMethod();
  if (authMethod === 'oauth' || authMethod === 'cli') {
    const authDescription = getAuthMethodDescription();
    console.log(`[ensureDb] Getting ${authDescription} database connection...`);
    try {
      // Import getDb for database connection
      const { getDb } = await import('./connection-pool.js');
      const database = await getDb();
      console.log(
        `[ensureDb] ${authDescription} db connection obtained successfully`,
      );
      return database;
    } catch (error) {
      console.error(
        `[ensureDb] Failed to get ${authDescription} connection:`,
        error,
      );
      throw error;
    }
  }

  // For static connections (POSTGRES_URL), use cached instance
  if (!db) {
    console.error('[ensureDb] DB is still null after initialization attempt!');
    throw new Error('Database connection could not be established');
  }
  return db;
}

export async function saveChat({
  id,
  userId,
  userEmail,
  title,
  visibility,
  customerId,
}: {
  id: string;
  userId: string;
  userEmail?: string | null;
  title: string;
  visibility: VisibilityType;
  customerId?: string | null;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[saveChat] Database not available, skipping persistence');
    return;
  }

  try {
    return await (await ensureDb()).insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      userEmail,
      title,
      visibility,
      customerId,
    });
  } catch (error) {
    console.error('[saveChat] Error saving chat:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to save chat');
  }
}

export async function deleteChatById({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[deleteChatById] Database not available, skipping deletion');
    return null;
  }

  try {
    await (await ensureDb()).delete(message).where(eq(message.chatId, id));
    await (await ensureDb())
      .delete(resolutionEvent)
      .where(eq(resolutionEvent.chatId, id));
    await (await ensureDb()).delete(agentTurn).where(eq(agentTurn.chatId, id));
    await (await ensureDb()).delete(handoff).where(eq(handoff.chatId, id));
    await (await ensureDb())
      .delete(turnMetric)
      .where(eq(turnMetric.chatId, id));

    const [chatsDeleted] = await (await ensureDb())
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete chat by id',
    );
  }
}

// 'all' is only for admin routes. A user scope with an empty id throws instead
// of silently dropping the filter and returning every user's chats.
export type ChatScope = { userId: string } | 'all';

export function chatScopeCondition(scope: ChatScope): SQL | undefined {
  if (scope === 'all') return undefined;
  if (!scope.userId) {
    throw new ChatSDKError(
      'bad_request:api',
      'A user-scoped chat query needs a userId',
    );
  }
  return eq(chat.userId, scope.userId);
}

// Qualified by hand: a select list renders a bare column name, which the
// subquery below would read as its own.
const CHAT_ID = sql`${chat}."id"`;

// The reason of a chat's most recent handoff (open or closed), or null.
const latestReason = (chatId: SQL) => sql<string | null>`(
  select h."reason" from ${handoff} h
  where h."chatId" = ${chatId}
  order by h."createdAt" desc limit 1
)`;

export async function getChats({
  scope,
  limit,
  startingAfter,
  endingBefore,
  handledBy,
  intent,
  useCase,
  assignedTo,
  status,
  customerId,
  handoffReason,
}: {
  scope: ChatScope;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
  handledBy?: string | Chat['handledBy'][];
  intent?: string;
  useCase?: string;
  assignedTo?: string;
  status?: 'open' | 'closed';
  customerId?: string;
  handoffReason?: string;
}) {
  const scopeCondition = chatScopeCondition(scope);

  if (!isDatabaseAvailable()) {
    console.log('[getChats] Database not available, returning empty');
    return { chats: [], hasMore: false };
  }

  try {
    const extendedLimit = limit + 1;

    const filterConditions: SQL<any>[] = scopeCondition ? [scopeCondition] : [];

    if (Array.isArray(handledBy)) {
      filterConditions.push(inArray(chat.handledBy, handledBy));
    } else if (handledBy) {
      filterConditions.push(eq(chat.handledBy, handledBy as Chat['handledBy']));
    }

    if (intent) {
      filterConditions.push(eq(chat.intent, intent));
    }

    if (useCase) {
      filterConditions.push(eq(chat.useCase, useCase));
    }

    if (assignedTo) {
      filterConditions.push(eq(chat.assignedTo, assignedTo));
    }

    if (customerId) {
      filterConditions.push(eq(chat.customerId, customerId));
    }

    if (handoffReason) {
      filterConditions.push(sql`${latestReason(CHAT_ID)} = ${handoffReason}`);
    }

    if (status === 'open') {
      filterConditions.push(isNull(chat.closedAt));
    } else if (status === 'closed') {
      filterConditions.push(isNotNull(chat.closedAt));
    }

    const query = async (whereCondition?: SQL<any>) => {
      const database = await ensureDb();
      const conditions = [...filterConditions];
      if (whereCondition) {
        conditions.push(whereCondition);
      }

      return database
        .select()
        .from(chat)
        .where(and(...conditions))
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);
    };

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      console.log('[getChats] Fetching chat for startingAfter:', startingAfter);
      const database = await ensureDb();
      const [selectedChat] = await database
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${startingAfter} not found`,
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      console.log('[getChats] Fetching chat for endingBefore:', endingBefore);
      const database = await ensureDb();
      const [selectedChat] = await database
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${endingBefore} not found`,
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      console.log('[getChats] Executing main query without pagination');
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;
    console.log(
      '[getChats] Query successful, found',
      filteredChats.length,
      'chats',
    );

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    console.error('[getChats] Error details:', error);
    console.error(
      '[getChats] Error stack:',
      error instanceof Error ? error.stack : 'No stack available',
    );
    throw new ChatSDKError('bad_request:database', 'Failed to get chats');
  }
}

export async function getChatOwners() {
  if (!isDatabaseAvailable()) {
    console.log('[getChatOwners] Database not available, returning empty');
    return [];
  }

  // One row per user: chats created before userEmail existed have it null,
  // so max() keeps the email from any newer chat of the same user.
  const userEmail = max(chat.userEmail);
  try {
    return await (await ensureDb())
      .select({ userId: chat.userId, userEmail })
      .from(chat)
      .groupBy(chat.userId)
      .orderBy(asc(userEmail));
  } catch (_error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get chat owners');
  }
}

// Latest customer message of each chat, in one query for a whole page of
// chats (DISTINCT ON), for the advisor inbox preview. Messages from before
// senderType existed count as the customer's when their role is 'user'.
export async function getLastCustomerMessages({
  chatIds,
}: {
  chatIds: string[];
}): Promise<DBMessage[]> {
  if (!isDatabaseAvailable() || chatIds.length === 0) return [];

  try {
    return await (await ensureDb())
      .selectDistinctOn([message.chatId])
      .from(message)
      .where(
        and(
          inArray(message.chatId, chatIds),
          or(
            eq(message.senderType, 'customer'),
            and(isNull(message.senderType), eq(message.role, 'user')),
          ),
        ),
      )
      .orderBy(message.chatId, desc(message.createdAt), desc(message.id));
  } catch (error) {
    console.error('[getLastCustomerMessages] Error:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get last customer messages',
    );
  }
}

// A console row per bank customer: the customer id, else the app user's
// email, else the user id.
export const CUSTOMER_KEY = sql<string>`coalesce(${chat.customerId}, ${chat.userEmail}, ${chat.userId})`;

export type CustomerInboxRow = {
  chat: Chat;
  customerKey: string;
  conversationCount: number;
  updatedAt: string;
};

// The advisor inbox grouped by customer: each customer's in-progress chat
// (the most recent unresolved one), or with status=closed the most recent
// resolved one, filtered like getChats, ordered by its last message.
// starting_after is the customerKey of the previous page's last row. Three
// queries whatever the page size: the rows, their chats, nothing per row.
export async function getCustomerInbox({
  userId,
  handledBy,
  useCase,
  assignedTo,
  handoffReason,
  status,
  limit,
  startingAfter,
}: {
  userId?: string;
  handledBy?: string | Chat['handledBy'][];
  useCase?: string;
  assignedTo?: string;
  handoffReason?: string;
  status?: 'open' | 'closed';
  limit: number;
  startingAfter?: string | null;
}): Promise<{ rows: CustomerInboxRow[]; hasMore: boolean }> {
  if (!isDatabaseAvailable()) return { rows: [], hasMore: false };

  const filters: SQL[] = [];
  if (Array.isArray(handledBy)) {
    filters.push(
      sql`r."handledBy" in (${sql.join(
        handledBy.map((h) => sql`${h}`),
        sql`, `,
      )})`,
    );
  } else if (handledBy) {
    filters.push(sql`r."handledBy" = ${handledBy}`);
  }
  if (useCase) filters.push(sql`r."useCase" = ${useCase}`);
  if (assignedTo) filters.push(sql`r."assignedTo" = ${assignedTo}`);
  if (handoffReason) filters.push(sql`r."reason" = ${handoffReason}`);
  if (startingAfter) {
    filters.push(sql`(r."updatedAt", r."customerKey") < (
      select c."updatedAt", c."customerKey" from ranked c
      where c."customerKey" = ${startingAfter}
    )`);
  }

  try {
    const database = await ensureDb();
    const found = (await database.execute(sql`
      with latest as (
        select distinct on (${CUSTOMER_KEY})
          ${chat.id} as "id", ${CUSTOMER_KEY} as "customerKey",
          ${chat.handledBy} as "handledBy", ${chat.useCase} as "useCase",
          ${chat.assignedTo} as "assignedTo", ${chat.closedAt} as "closedAt",
          ${chat.createdAt} as "createdAt"
        from ${chat}
        where ${chat.closedAt} is ${status === 'closed' ? sql`not null` : sql`null`}
          ${userId ? sql`and ${chat.userId} = ${userId}` : sql``}
        order by ${CUSTOMER_KEY}, ${chat.createdAt} desc, ${chat.id} desc
      ),
      totals as (
        select ${CUSTOMER_KEY} as "customerKey", count(*) as "conversationCount"
        from ${chat}
        ${userId ? sql`where ${chat.userId} = ${userId}` : sql``}
        group by 1
      ),
      ranked as (
        select l.*, t."conversationCount", ${latestReason(sql`l."id"`)} as "reason",
          coalesce(
            (select max(m."createdAt") from ${message} m where m."chatId" = l."id"),
            l."createdAt"
          ) as "updatedAt"
        from latest l
        join totals t on t."customerKey" = l."customerKey"
      )
      select r."id", r."customerKey", r."conversationCount"::int as "conversationCount",
        to_char(r."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "updatedAt"
      from ranked r
      ${filters.length ? sql`where ${sql.join(filters, sql` and `)}` : sql``}
      order by r."updatedAt" desc, r."customerKey" desc
      limit ${limit + 1}
    `)) as unknown as Array<{
      id: string;
      customerKey: string;
      conversationCount: number;
      updatedAt: string;
    }>;

    const hasMore = found.length > limit;
    const page = found.slice(0, limit);
    const chats =
      page.length === 0
        ? []
        : await database
            .select()
            .from(chat)
            .where(
              inArray(
                chat.id,
                page.map((r) => r.id),
              ),
            );
    const byId = new Map(chats.map((c) => [c.id, c]));

    return {
      rows: page.flatMap((r) => {
        const row = byId.get(r.id);
        return row
          ? [
              {
                chat: row,
                customerKey: r.customerKey,
                conversationCount: Number(r.conversationCount),
                updatedAt: r.updatedAt,
              },
            ]
          : [];
      }),
      hasMore,
    };
  } catch (error) {
    console.error('[getCustomerInbox] Error:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get the inbox by customer',
    );
  }
}

// Every chat of a customer (by CUSTOMER_KEY), oldest first.
export async function getChatsByCustomerKey({
  customerKey,
}: {
  customerKey: string;
}): Promise<Chat[]> {
  if (!isDatabaseAvailable()) return [];

  try {
    return await (await ensureDb())
      .select()
      .from(chat)
      .where(eq(CUSTOMER_KEY, customerKey))
      .orderBy(asc(chat.createdAt), asc(chat.id));
  } catch (error) {
    console.error('[getChatsByCustomerKey] Error:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get the customer conversations',
    );
  }
}

export interface ConversationCounts {
  total: number;
  byUseCase: Record<string, number>;
  withoutUseCase: number;
  unattended: number;
  mine: number;
  resolved: number;
  aiAgent: number;
  // aiAgent split by the in-progress conversation's use case (only > 0).
  aiAgentByUseCase: Record<string, number>;
  withAdvisor: number;
  byHandoffReason: Record<string, number>;
}

// The human inbox: chats a person has to handle. David's own chats stay out.
export const HUMAN_HANDLED_BY: Chat['handledBy'][] = [
  'human_queue',
  'human_agent',
];

// Counts for the advisor console's view bar, with the same semantics as each
// view: total/byUseCase = open human cases (the inbox), aiAgent = open chats
// David handles, unattended = human_queue,
// mine = open and assigned to advisorEmail, resolved = closed. One aggregate
// query (a row per use case), no chat rows.
// byCustomer counts customers instead: each one by its in-progress chat, and
// resolved by customers with a resolved chat. byHandoffReason and withAdvisor
// count the same base as total (human_agent only for withAdvisor).
export async function getConversationCounts({
  userId,
  advisorEmail,
  byCustomer = false,
}: {
  userId?: string;
  advisorEmail?: string;
  byCustomer?: boolean;
}): Promise<ConversationCounts> {
  const counts: ConversationCounts = {
    total: 0,
    byUseCase: {},
    withoutUseCase: 0,
    unattended: 0,
    mine: 0,
    resolved: 0,
    aiAgent: 0,
    aiAgentByUseCase: {},
    withAdvisor: 0,
    byHandoffReason: { complaint: 0, retention: 0, case_status: 0 },
  };
  if (!isDatabaseAvailable()) return counts;

  const countWhere = (condition: SQL) =>
    sql<number>`count(*) filter (where ${condition})`.mapWith(Number);

  try {
    const database = await ensureDb();
    const userCondition = userId ? eq(chat.userId, userId) : undefined;
    const latest = database
      .selectDistinctOn([CUSTOMER_KEY], {
        useCase: chat.useCase,
        handledBy: chat.handledBy,
        assignedTo: chat.assignedTo,
        closedAt: chat.closedAt,
        reason: latestReason(CHAT_ID).as('reason'),
      })
      .from(chat)
      .where(and(userCondition, isNull(chat.closedAt)))
      .orderBy(CUSTOMER_KEY, desc(chat.createdAt), desc(chat.id))
      .as('latest');
    // The subquery exposes the same column names, so the counts below read
    // either source.
    const c = (byCustomer ? latest : chat) as unknown as typeof chat;

    const rows = await database
      .select({
        useCase: c.useCase,
        open: countWhere(
          and(
            isNull(c.closedAt),
            inArray(c.handledBy, HUMAN_HANDLED_BY),
          ) as SQL,
        ),
        aiAgent: countWhere(
          and(isNull(c.closedAt), eq(c.handledBy, 'ai_agent')) as SQL,
        ),
        withAdvisor: countWhere(
          and(isNull(c.closedAt), eq(c.handledBy, 'human_agent')) as SQL,
        ),
        unattended: countWhere(eq(c.handledBy, 'human_queue')),
        mine: advisorEmail
          ? countWhere(
              and(eq(c.assignedTo, advisorEmail), isNull(c.closedAt)) as SQL,
            )
          : sql<number>`0`.mapWith(Number),
        resolved: countWhere(isNotNull(c.closedAt)),
      })
      .from(byCustomer ? latest : chat)
      .where(byCustomer ? undefined : userCondition)
      .groupBy(c.useCase);

    const reason = byCustomer
      ? sql<string | null>`${latest.reason}`
      : latestReason(CHAT_ID);
    const reasonRows = await database
      .select({ reason, n: sql<number>`count(*)`.mapWith(Number) })
      .from(byCustomer ? latest : chat)
      .where(
        and(
          byCustomer ? undefined : userCondition,
          isNull(c.closedAt),
          inArray(c.handledBy, HUMAN_HANDLED_BY),
        ),
      )
      .groupBy(reason);
    for (const row of reasonRows) {
      if (row.reason) counts.byHandoffReason[row.reason] = row.n;
    }

    if (byCustomer) {
      const [closed] = await database
        .select({
          n: sql<number>`count(distinct ${CUSTOMER_KEY})`.mapWith(Number),
        })
        .from(chat)
        .where(and(userCondition, isNotNull(chat.closedAt)));
      counts.resolved = closed?.n ?? 0;
    }

    for (const row of rows) {
      counts.total += row.open;
      if (!row.useCase) counts.withoutUseCase += row.open;
      else if (row.open > 0) counts.byUseCase[row.useCase] = row.open;
      counts.unattended += row.unattended;
      counts.mine += row.mine;
      if (!byCustomer) counts.resolved += row.resolved;
      counts.aiAgent += row.aiAgent;
      if (row.useCase && row.aiAgent > 0) {
        counts.aiAgentByUseCase[row.useCase] = row.aiAgent;
      }
      counts.withAdvisor += row.withAdvisor;
    }
    return counts;
  } catch (error) {
    console.error('[getConversationCounts] Error:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to count conversations',
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[getChatById] Database not available, returning null');
    return null;
  }

  try {
    const [selectedChat] = await (await ensureDb())
      .select()
      .from(chat)
      .where(eq(chat.id, id));
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
  }
}

export type TakeChatResult =
  | { outcome: 'not_found' }
  | { outcome: 'conflict'; assignedTo: string | null }
  | { outcome: 'taken'; chat: Chat; alreadyMine: boolean };

// Single atomic UPDATE, race-safe: the WHERE clause is evaluated against the
// row's pre-update state (captured in the `prev` CTE) in the same statement,
// so two concurrent takes on a free chat can't both succeed. `alreadyMine`
// tells the caller whether this was a genuine takeover (write the system
// message) or an idempotent re-take of a chat already assigned to them.
export async function takeChat({
  chatId,
  advisorEmail,
}: {
  chatId: string;
  advisorEmail: string;
}): Promise<TakeChatResult> {
  if (!isDatabaseAvailable()) {
    console.log('[takeChat] Database not available, skipping update');
    return { outcome: 'not_found' };
  }

  try {
    const db = await ensureDb();
    // Only "prev" (the pre-update row) is read from this raw result: the
    // driver doesn't apply drizzle's column type mapping to sql`` results, so
    // the updated row itself is re-read below via getChatById for a
    // properly-typed Chat (Dates, not timestamp strings).
    const rows = (await db.execute(sql`
      with "prev" as (
        select "handledBy", "assignedTo" from ${chat} where "id" = ${chatId}
      )
      update ${chat} as c
      set "handledBy" = 'human_agent',
          "assignedTo" = ${advisorEmail},
          "assignedAt" = now(),
          "closedAt" = null,
          "hadHuman" = true
      from "prev"
      where c."id" = ${chatId}
        -- Checked on the target row, not on "prev": when two takes race,
        -- Postgres re-checks the locked row's current values, so the second
        -- one sees the first owner and matches nothing (409).
        and (c."handledBy" <> 'human_agent' or c."assignedTo" = ${advisorEmail})
      returning "prev"."handledBy" as "prevHandledBy", "prev"."assignedTo" as "prevAssignedTo"
    `)) as unknown as Array<{
      prevHandledBy: Chat['handledBy'] | null;
      prevAssignedTo: string | null;
    }>;

    if (rows.length === 0) {
      const existing = await getChatById({ id: chatId });
      if (!existing) return { outcome: 'not_found' };
      return { outcome: 'conflict', assignedTo: existing.assignedTo };
    }

    const { prevHandledBy, prevAssignedTo } = rows[0];
    const alreadyMine =
      prevHandledBy === 'human_agent' && prevAssignedTo === advisorEmail;
    const updatedChat = await getChatById({ id: chatId });
    if (!updatedChat) return { outcome: 'not_found' };

    return { outcome: 'taken', chat: updatedChat, alreadyMine };
  } catch (error) {
    console.error('[takeChat] Error taking chat:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to take chat');
  }
}

export async function releaseChat({
  chatId,
  outcome,
}: {
  chatId: string;
  outcome: 'returned_to_agent' | 'resolved';
}) {
  if (!isDatabaseAvailable()) {
    console.log('[releaseChat] Database not available, skipping update');
    return;
  }

  try {
    const [updated] = await (await ensureDb())
      .update(chat)
      .set({
        handledBy: 'ai_agent',
        assignedTo: null,
        assignedAt: null,
        closedAt: outcome === 'resolved' ? new Date() : null,
      })
      .where(eq(chat.id, chatId))
      .returning();
    if (updated) await closeHandoffs({ chatId });
    if (updated && outcome === 'resolved') {
      await (await ensureDb()).insert(resolutionEvent).values({
        chatId,
        resolvedBy: 'human',
        hadHuman: updated.hadHuman,
        useCase: updated.useCase,
        resolvedAt: updated.closedAt ?? new Date(),
      });
    }
    return updated;
  } catch (_error) {
    throw new ChatSDKError('bad_request:database', 'Failed to release chat');
  }
}

export async function reopenChat({ chatId }: { chatId: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[reopenChat] Database not available, skipping update');
    return;
  }

  try {
    return await (await ensureDb())
      .update(chat)
      // A new conversation starts without a use case: the console shows the one
      // in progress, and the closed one keeps its own in its ResolutionEvent.
      .set({ closedAt: null, hadHuman: false, useCase: null })
      .where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatSDKError('bad_request:database', 'Failed to reopen chat');
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<
    Omit<DBMessage, 'senderType' | 'senderId'> &
      Partial<Pick<DBMessage, 'senderType' | 'senderId'>>
  >;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[saveMessages] Database not available, skipping persistence');
    return;
  }

  try {
    // Use upsert to handle both new messages and updates (e.g., MCP approval continuations)
    // When a message ID already exists, update its parts (which may have changed)
    // Using sql`excluded.X` to reference the values that would have been inserted
    return await (await ensureDb())
      .insert(message)
      .values(
        messages.map((m) => ({
          senderType: m.senderType ?? null,
          senderId: m.senderId ?? null,
          ...m,
        })),
      )
      .onConflictDoUpdate({
        target: message.id,
        set: {
          parts: sql`excluded.parts`,
          attachments: sql`excluded.attachments`,
        },
      });
  } catch (_error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save messages');
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[getMessagesByChatId] Database not available, returning empty');
    return [];
  }

  try {
    return await (await ensureDb())
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get messages by chat id',
    );
  }
}

// Returns null when `afterId` doesn't exist or belongs to another chat, so
// the route can respond 400. Ordered by (createdAt, id) so polling never
// loses or repeats a message that shares a createdAt with `afterId`.
export async function getMessagesAfter({
  chatId,
  afterId,
}: {
  chatId: string;
  afterId?: string | null;
}): Promise<DBMessage[] | null> {
  if (!isDatabaseAvailable()) {
    console.log('[getMessagesAfter] Database not available, returning empty');
    return [];
  }

  try {
    const db = await ensureDb();

    if (!afterId) {
      return await db
        .select()
        .from(message)
        .where(eq(message.chatId, chatId))
        .orderBy(asc(message.createdAt), asc(message.id));
    }

    const [afterMessage] = await db
      .select()
      .from(message)
      .where(eq(message.id, afterId));

    if (!afterMessage || afterMessage.chatId !== chatId) {
      return null;
    }

    return await db
      .select()
      .from(message)
      .where(
        and(
          eq(message.chatId, chatId),
          or(
            gt(message.createdAt, afterMessage.createdAt),
            and(
              eq(message.createdAt, afterMessage.createdAt),
              gt(message.id, afterMessage.id),
            ),
          ),
        ),
      )
      .orderBy(asc(message.createdAt), asc(message.id));
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get messages after id',
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[getMessageById] Database not available, returning empty');
    return [];
  }

  try {
    return await (await ensureDb())
      .select()
      .from(message)
      .where(eq(message.id, id));
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message by id',
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[deleteMessagesByChatIdAfterTimestamp] Database not available, skipping deletion');
    return;
  }

  try {
    const messagesToDelete = await (await ensureDb())
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      return await (await ensureDb())
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete messages by chat id after timestamp',
    );
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  if (!isDatabaseAvailable()) {
    console.log('[updateChatVisiblityById] Database not available, skipping update');
    return;
  }

  try {
    return await (await ensureDb())
      .update(chat)
      .set({ visibility })
      .where(eq(chat.id, chatId));
  } catch (_error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update chat visibility by id',
    );
  }
}

export async function updateChatLastContextById({
  chatId,
  context,
}: {
  chatId: string;
  // Store raw LanguageModelUsage to keep it simple
  context: LanguageModelV3Usage;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[updateChatLastContextById] Database not available, skipping update');
    return;
  }

  try {
    return await (await ensureDb())
      .update(chat)
      .set({ lastContext: context })
      .where(eq(chat.id, chatId));
  } catch (error) {
    console.warn('Failed to update lastContext for chat', chatId, error);
    return;
  }
}

export async function updateChatAgentState({
  chatId,
  useCase,
  intent,
  language,
  handledBy,
}: {
  chatId: string;
  useCase?: string | null;
  intent?: string | null;
  language?: string | null;
  handledBy?: Chat['handledBy'];
}) {
  if (!isDatabaseAvailable()) {
    console.log('[updateChatAgentState] Database not available, skipping update');
    return;
  }

  try {
    const updates: Partial<{
      useCase: string | null;
      intent: string | null;
      language: string | null;
      handledBy: Chat['handledBy'];
      hadHuman: boolean;
    }> = {};
    if (useCase !== undefined) updates.useCase = useCase;
    if (intent !== undefined) updates.intent = intent;
    if (language !== undefined) updates.language = language;
    if (handledBy !== undefined) updates.handledBy = handledBy;
    if (handledBy && handledBy !== 'ai_agent') updates.hadHuman = true;

    if (Object.keys(updates).length === 0) return;

    return await (await ensureDb())
      .update(chat)
      .set(updates)
      .where(eq(chat.id, chatId));
  } catch (error) {
    console.warn('Failed to update agent state for chat', chatId, error);
    return;
  }
}

// The agent said goodbye: closes the chat and logs an 'ai' resolution event
// in one statement, only while the agent handles it and it is still open.
// handledBy stays as is, like release resolved.
export async function resolveChatByAgent({ chatId }: { chatId: string }) {
  if (!isDatabaseAvailable()) {
    console.log('[resolveChatByAgent] Database not available, skipping');
    return;
  }

  try {
    await (await ensureDb()).execute(sql`
      with "closed" as (
        update ${chat} set "closedAt" = now()
        where "id" = ${chatId}
          and "handledBy" = 'ai_agent'
          and "closedAt" is null
        returning "id", "hadHuman", "useCase", "closedAt"
      )
      insert into ${resolutionEvent}
        ("chatId", "resolvedBy", "hadHuman", "useCase", "resolvedAt")
      select "id", 'ai', "hadHuman", "useCase", "closedAt" from "closed"
    `);
  } catch (error) {
    console.warn('Failed to resolve chat by agent', chatId, error);
  }
}

export interface ResolutionTotals {
  total: number;
  aiContained: number;
  human: number;
  assisted: number;
}

export interface LatencyMetrics {
  p50Ms: number | null;
  p95Ms: number | null;
  turns: number;
}

// Token totals over the turns that reported usage. durationMs is the sum of
// those turns' durations, for the App's share of the cost (server/src/pricing.ts).
export interface CostAggregates {
  turnsWithUsage: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  // Distinct chats with at least one turn in the range.
  conversations: number;
}

export interface ResolutionMetrics extends ResolutionTotals {
  byUseCase: Record<string, ResolutionTotals>;
  byDay: Array<{ day: string } & ResolutionTotals>;
  latency: LatencyMetrics;
  cost: CostAggregates;
}

// Chats resolved without a use case are grouped under this key.
export const NO_USE_CASE = 'NONE';

// Resolution metrics from ResolutionEvent (docs/flujo-atencion.md §6), one
// aggregate query grouped by local day and use case. from/to are inclusive
// YYYY-MM-DD days in `tz`, an IANA zone the caller has already validated.
export async function getResolutionMetrics({
  from,
  to,
  tz = 'UTC',
}: {
  from?: string;
  to?: string;
  tz?: string;
}): Promise<ResolutionMetrics> {
  const metrics: ResolutionMetrics = {
    total: 0,
    aiContained: 0,
    human: 0,
    assisted: 0,
    byUseCase: {},
    byDay: [],
    latency: { p50Ms: null, p95Ms: null, turns: 0 },
    cost: {
      turnsWithUsage: 0,
      inputTokens: 0,
      outputTokens: 0,
      durationMs: 0,
      conversations: 0,
    },
  };
  if (!isDatabaseAvailable()) return metrics;

  const countWhere = (condition: SQL) =>
    sql<number>`count(*) filter (where ${condition})`.mapWith(Number);
  // resolvedAt is stored as UTC wall-clock time. The zone goes in as a
  // literal, not a bound parameter, so the select and GROUP BY render the
  // same expression; the route only lets through valid IANA names.
  const local = sql`((${resolutionEvent.resolvedAt} at time zone 'UTC') at time zone ${sql.raw(`'${tz.replaceAll("'", "''")}'`)})`;
  const day = sql<string>`to_char(${local}, 'YYYY-MM-DD')`;
  const conditions: SQL[] = [];
  if (from) conditions.push(sql`${local} >= ${from}::date`);
  if (to) conditions.push(sql`${local} < ${to}::date + interval '1 day'`);

  try {
    const rows = await (await ensureDb())
      .select({
        day,
        useCase: resolutionEvent.useCase,
        total: sql<number>`count(*)`.mapWith(Number),
        aiContained: countWhere(
          sql`${resolutionEvent.resolvedBy} = 'ai' and not ${resolutionEvent.hadHuman}`,
        ),
        human: countWhere(sql`${resolutionEvent.resolvedBy} = 'human'`),
        assisted: countWhere(
          sql`${resolutionEvent.resolvedBy} = 'ai' and ${resolutionEvent.hadHuman}`,
        ),
      })
      .from(resolutionEvent)
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(day, resolutionEvent.useCase)
      .orderBy(day);

    const empty = (): ResolutionTotals => ({
      total: 0,
      aiContained: 0,
      human: 0,
      assisted: 0,
    });
    const add = (target: ResolutionTotals, row: ResolutionTotals) => {
      target.total += row.total;
      target.aiContained += row.aiContained;
      target.human += row.human;
      target.assisted += row.assisted;
    };
    const byDay = new Map<string, { day: string } & ResolutionTotals>();

    for (const row of rows) {
      add(metrics, row);
      const useCase = row.useCase ?? NO_USE_CASE;
      metrics.byUseCase[useCase] ??= empty();
      add(metrics.byUseCase[useCase], row);
      if (!byDay.has(row.day)) byDay.set(row.day, { day: row.day, ...empty() });
      add(byDay.get(row.day) as ResolutionTotals, row);
    }
    metrics.byDay = [...byDay.values()];

    // Same range, over TurnMetric.createdAt (also UTC wall-clock time).
    const turnLocal = sql`((${turnMetric.createdAt} at time zone 'UTC') at time zone ${sql.raw(`'${tz.replaceAll("'", "''")}'`)})`;
    const turnConditions: SQL[] = [];
    if (from) turnConditions.push(sql`${turnLocal} >= ${from}::date`);
    if (to) {
      turnConditions.push(sql`${turnLocal} < ${to}::date + interval '1 day'`);
    }
    const hasUsage = sql`${turnMetric.inputTokens} is not null and ${turnMetric.outputTokens} is not null`;
    const [turns] = await (await ensureDb())
      .select({
        liveTurns: countWhere(sql`${turnMetric.source} = 'live'`),
        p50: sql<
          number | null
        >`percentile_cont(0.5) within group (order by ${turnMetric.durationMs}) filter (where ${turnMetric.source} = 'live')`,
        p95: sql<
          number | null
        >`percentile_cont(0.95) within group (order by ${turnMetric.durationMs}) filter (where ${turnMetric.source} = 'live')`,
        turnsWithUsage: countWhere(hasUsage),
        inputTokens:
          sql<number>`coalesce(sum(${turnMetric.inputTokens}) filter (where ${hasUsage}), 0)`.mapWith(
            Number,
          ),
        outputTokens:
          sql<number>`coalesce(sum(${turnMetric.outputTokens}) filter (where ${hasUsage}), 0)`.mapWith(
            Number,
          ),
        durationMs:
          sql<number>`coalesce(sum(${turnMetric.durationMs}) filter (where ${hasUsage}), 0)`.mapWith(
            Number,
          ),
        conversations:
          sql<number>`count(distinct ${turnMetric.chatId})`.mapWith(Number),
      })
      .from(turnMetric)
      .where(turnConditions.length ? and(...turnConditions) : undefined);
    if (turns) {
      metrics.latency = {
        p50Ms: turns.p50 === null ? null : Number(turns.p50),
        p95Ms: turns.p95 === null ? null : Number(turns.p95),
        turns: turns.liveTurns,
      };
      metrics.cost = {
        turnsWithUsage: turns.turnsWithUsage,
        inputTokens: turns.inputTokens,
        outputTokens: turns.outputTokens,
        durationMs: turns.durationMs,
        conversations: turns.conversations,
      };
    }
    return metrics;
  } catch (error) {
    console.error('[getResolutionMetrics] Error:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get resolution metrics',
    );
  }
}

export async function updateChatCustomer({
  chatId,
  customerId,
}: {
  chatId: string;
  customerId: string;
}) {
  if (!isDatabaseAvailable()) {
    console.log('[updateChatCustomer] Database not available, skipping');
    return;
  }

  try {
    await (await ensureDb())
      .update(chat)
      .set({ customerId, customerName: null })
      .where(eq(chat.id, chatId));
  } catch (error) {
    console.warn('Failed to update customer for chat', chatId, error);
  }
}

// Fills customerName on every chat of that customer still missing it.
export async function setCustomerName({
  customerId,
  customerName,
}: {
  customerId: string;
  customerName: string;
}) {
  if (!isDatabaseAvailable()) return;

  await (await ensureDb())
    .update(chat)
    .set({ customerName })
    .where(and(eq(chat.customerId, customerId), isNull(chat.customerName)));
}

// Customer ids with at least one chat missing customerName (backfill).
export async function getCustomerIdsWithoutName(): Promise<string[]> {
  if (!isDatabaseAvailable()) return [];

  const rows = await (await ensureDb())
    .selectDistinct({ customerId: chat.customerId })
    .from(chat)
    .where(and(isNotNull(chat.customerId), isNull(chat.customerName)));
  return rows.map((r) => r.customerId).filter((id): id is string => !!id);
}

export async function enqueueAgentTurn({
  chatId,
  messageId,
  userId,
  sessionToken,
  language,
}: {
  chatId: string;
  messageId: string;
  userId: string;
  sessionToken?: string | null;
  language?: string | null;
}) {
  await (await ensureDb()).insert(agentTurn).values({
    chatId,
    messageId,
    userId,
    sessionToken: sessionToken ?? null,
    language: language ?? null,
  });
}

// Claims up to `limit` due turns, the oldest pending one per chat (turns of a
// chat go in order), and leases them for `leaseMs` by pushing nextAttemptAt:
// another worker skips them (SKIP LOCKED now, the lease afterwards).
export async function claimAgentTurns({
  limit,
  leaseMs,
}: {
  limit: number;
  leaseMs: number;
}): Promise<AgentTurn[]> {
  if (!isDatabaseAvailable()) return [];

  const rows = (await (await ensureDb()).execute(sql`
    update ${agentTurn} set "nextAttemptAt" = now() + ${`${leaseMs} milliseconds`}::interval
    where "id" in (
      select t."id" from ${agentTurn} t
      where t."status" = 'pending' and t."nextAttemptAt" <= now()
        and not exists (
          select 1 from ${agentTurn} o
          where o."chatId" = t."chatId" and o."status" = 'pending'
            and o."createdAt" < t."createdAt"
        )
      order by t."createdAt"
      limit ${limit}
      for update skip locked
    )
    returning "id"
  `)) as unknown as Array<{ id: string }>;
  if (rows.length === 0) return [];

  return (await ensureDb())
    .select()
    .from(agentTurn)
    .where(
      inArray(
        agentTurn.id,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(agentTurn.createdAt));
}

export async function finishAgentTurn({
  id,
  status,
}: {
  id: string;
  status: 'done' | 'discarded' | 'expired';
}) {
  await (await ensureDb())
    .update(agentTurn)
    .set({ status })
    .where(eq(agentTurn.id, id));
}

export async function retryAgentTurnLater({
  id,
  delayMs,
}: {
  id: string;
  delayMs: number;
}) {
  await (await ensureDb())
    .update(agentTurn)
    .set({
      attempts: sql`${agentTurn.attempts} + 1`,
      nextAttemptAt: sql`now() + ${`${delayMs} milliseconds`}::interval`,
    })
    .where(eq(agentTurn.id, id));
}

// Puts a claimed turn back without counting an attempt (it wasn't tried).
export async function deferAgentTurn({
  id,
  delayMs,
}: {
  id: string;
  delayMs: number;
}) {
  await (await ensureDb())
    .update(agentTurn)
    .set({ nextAttemptAt: sql`now() + ${`${delayMs} milliseconds`}::interval` })
    .where(eq(agentTurn.id, id));
}

export async function hasPendingAgentTurn({
  chatId,
}: {
  chatId: string;
}): Promise<boolean> {
  if (!isDatabaseAvailable()) return false;

  const [row] = await (await ensureDb())
    .select({ id: agentTurn.id })
    .from(agentTurn)
    .where(and(eq(agentTurn.chatId, chatId), eq(agentTurn.status, 'pending')))
    .limit(1);
  return Boolean(row);
}

// Cancels the chat's queued turns (a handoff or an advisor take: David has
// nothing more to say there).
export async function cancelAgentTurns({ chatId }: { chatId: string }) {
  if (!isDatabaseAvailable()) return;

  await (await ensureDb())
    .update(agentTurn)
    .set({ status: 'discarded' })
    .where(and(eq(agentTurn.chatId, chatId), eq(agentTurn.status, 'pending')));
}

export async function getAgentTurns({
  chatId,
}: {
  chatId: string;
}): Promise<AgentTurn[]> {
  return (await ensureDb())
    .select()
    .from(agentTurn)
    .where(eq(agentTurn.chatId, chatId))
    .orderBy(asc(agentTurn.createdAt));
}

// Records the agent's handoff; a no-op while the chat already has one open
// (the partial unique index Handoff_open_chat).
export async function openHandoff({
  chatId,
  reason,
  summary,
  facts,
}: {
  chatId: string;
  reason: string;
  summary: string | null;
  facts: Record<string, unknown> | null;
}) {
  if (!isDatabaseAvailable()) return;

  await (await ensureDb())
    .insert(handoff)
    .values({ chatId, reason, summary, facts })
    .onConflictDoNothing();
}

export async function hasOpenHandoff({
  chatId,
}: {
  chatId: string;
}): Promise<boolean> {
  if (!isDatabaseAvailable()) return false;

  const [row] = await (await ensureDb())
    .select({ id: handoff.id })
    .from(handoff)
    .where(and(eq(handoff.chatId, chatId), isNull(handoff.resolvedAt)))
    .limit(1);
  return Boolean(row);
}

export async function closeHandoffs({ chatId }: { chatId: string }) {
  await (await ensureDb())
    .update(handoff)
    .set({ resolvedAt: new Date() })
    .where(and(eq(handoff.chatId, chatId), isNull(handoff.resolvedAt)));
}

// The most recent handoff of each chat (open or closed), in one query.
export async function getLatestHandoffs({
  chatIds,
}: {
  chatIds: string[];
}): Promise<Handoff[]> {
  if (!isDatabaseAvailable() || chatIds.length === 0) return [];

  return (await ensureDb())
    .selectDistinctOn([handoff.chatId])
    .from(handoff)
    .where(inArray(handoff.chatId, chatIds))
    .orderBy(handoff.chatId, desc(handoff.createdAt));
}

export async function markMessagesBlocked({ ids }: { ids: string[] }) {
  if (!isDatabaseAvailable()) {
    console.log('[markMessagesBlocked] Database not available, skipping update');
    return;
  }

  if (ids.length === 0) return;

  try {
    return await (await ensureDb())
      .update(message)
      .set({ blocked: true })
      .where(inArray(message.id, ids));
  } catch (error) {
    console.warn('Failed to mark messages blocked', ids, error);
    return;
  }
}

// Saves the turn's metric. It never breaks the turn: a failure only warns.
export async function saveTurnMetric(
  row: Omit<TurnMetric, 'id' | 'createdAt'>,
) {
  if (!isDatabaseAvailable()) return;

  try {
    await (await ensureDb()).insert(turnMetric).values(row);
  } catch (error) {
    console.warn('Failed to save turn metric for chat', row.chatId, error);
  }
}

export async function getTurnMetrics({
  chatId,
}: {
  chatId: string;
}): Promise<TurnMetric[]> {
  if (!isDatabaseAvailable()) return [];

  return (await ensureDb())
    .select()
    .from(turnMetric)
    .where(eq(turnMetric.chatId, chatId))
    .orderBy(asc(turnMetric.createdAt));
}

// The last message of the chat's last closed conversation: the newest message
// saved at or before its latest ResolutionEvent, or null if it never closed.
// Compared in the database, at millisecond precision.
export async function getLastClosedMessageId({
  chatId,
}: {
  chatId: string;
}): Promise<string | null> {
  if (!isDatabaseAvailable()) return null;

  const [row] = await (await ensureDb())
    .select({ id: message.id })
    .from(message)
    .where(
      and(
        eq(message.chatId, chatId),
        sql`${message.createdAt} <= (select max(${resolutionEvent.resolvedAt}) from ${resolutionEvent} where ${resolutionEvent.chatId} = ${chatId})`,
      ),
    )
    .orderBy(desc(message.createdAt))
    .limit(1);
  return row?.id ?? null;
}

