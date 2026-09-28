import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  max,
  sql,
  type SQL,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { chat, message, type DBMessage, type Chat } from './schema';
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
}: {
  id: string;
  userId: string;
  userEmail?: string | null;
  title: string;
  visibility: VisibilityType;
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

export async function getChats({
  scope,
  limit,
  startingAfter,
  endingBefore,
  handledBy,
  intent,
  useCase,
}: {
  scope: ChatScope;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
  handledBy?: string;
  intent?: string;
  useCase?: string;
}) {
  const scopeCondition = chatScopeCondition(scope);

  if (!isDatabaseAvailable()) {
    console.log('[getChats] Database not available, returning empty');
    return { chats: [], hasMore: false };
  }

  try {
    const extendedLimit = limit + 1;

    const filterConditions: SQL<any>[] = scopeCondition ? [scopeCondition] : [];

    if (handledBy) {
      filterConditions.push(eq(chat.handledBy, handledBy as Chat['handledBy']));
    }

    if (intent) {
      filterConditions.push(eq(chat.intent, intent));
    }

    if (useCase) {
      filterConditions.push(eq(chat.useCase, useCase));
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

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
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
      .values(messages)
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
    }> = {};
    if (useCase !== undefined) updates.useCase = useCase;
    if (intent !== undefined) updates.intent = intent;
    if (language !== undefined) updates.language = language;
    if (handledBy !== undefined) updates.handledBy = handledBy;

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
