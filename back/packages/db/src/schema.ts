import { sql, type InferSelectModel } from 'drizzle-orm';
import {
  varchar,
  timestamp,
  json,
  jsonb,
  uuid,
  text,
  boolean,
  integer,
  pgSchema,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { LanguageModelV3Usage } from '@ai-sdk/provider';
import type { User as SharedUser } from '@chat-template/utils';

const schemaName = 'ai_chatbot';
const customSchema = pgSchema(schemaName);

// Helper function to create table with proper schema handling
// Use the schema object for proper drizzle-kit migration generation
const createTable = customSchema.table;

export const user = createTable('User', {
  id: text('id').primaryKey().notNull(),
  email: varchar('email', { length: 64 }).notNull(),
  // Password removed - using Databricks SSO authentication
});

export type User = SharedUser;

export const chat = createTable('Chat', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull(),
  title: text('title').notNull(),
  userId: text('userId').notNull(),
  userEmail: varchar('userEmail', { length: 256 }),
  visibility: varchar('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
  lastContext: jsonb('lastContext').$type<LanguageModelV3Usage | null>(),
  handledBy: varchar('handledBy', {
    enum: ['ai_agent', 'human_queue', 'human_agent'],
  })
    .notNull()
    .default('ai_agent'),
  useCase: varchar('useCase', { length: 128 }),
  intent: varchar('intent', { length: 128 }),
  language: varchar('language', { length: 16 }),
  assignedTo: varchar('assignedTo', { length: 256 }),
  assignedAt: timestamp('assignedAt'),
  closedAt: timestamp('closedAt'),
  // A handoff or a take happened since the chat last opened; a customer
  // message on a closed chat resets it. Feeds ResolutionEvent.hadHuman.
  hadHuman: boolean('hadHuman').notNull().default(false),
  // The bank customer of the chat's session (demo token -> customer_id), for
  // the console's customer context. Null when the chat has no session.
  customerId: varchar('customerId', { length: 64 }),
  // First and last name from customer_360, looked up once per customer id so
  // the console shows the bank customer. Never sent on customer routes.
  customerName: varchar('customerName', { length: 256 }),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = createTable('Message', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  parts: json('parts').notNull(),
  attachments: json('attachments').notNull(),
  createdAt: timestamp('createdAt').notNull(),
  blocked: boolean('blocked').notNull().default(false),
  senderType: varchar('senderType', {
    enum: ['customer', 'ai_agent', 'human_agent', 'system'],
  }),
  senderId: varchar('senderId', { length: 256 }),
});

export type DBMessage = InferSelectModel<typeof message>;

// One row per close (a chat that reopens and closes again logs another):
// resolvedBy 'ai' = the customer said goodbye with David handling the chat,
// 'human' = an advisor resolved it. Metrics in docs/flujo-atencion.md §6.
export const resolutionEvent = createTable('ResolutionEvent', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  resolvedBy: varchar('resolvedBy', { enum: ['ai', 'human'] }).notNull(),
  hadHuman: boolean('hadHuman').notNull(),
  useCase: varchar('useCase', { length: 128 }),
  resolvedAt: timestamp('resolvedAt').notNull().defaultNow(),
});

export type ResolutionEvent = InferSelectModel<typeof resolutionEvent>;

// A customer turn the agent couldn't take (it was unavailable): the message is
// stored and a worker answers it once the agent is back (server/src/agent-queue.ts).
// nextAttemptAt doubles as a lease while a worker holds the turn.
export const agentTurn = createTable('AgentTurn', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  messageId: uuid('messageId').notNull(),
  userId: text('userId').notNull(),
  sessionToken: varchar('sessionToken', { length: 256 }),
  status: varchar('status', {
    enum: ['pending', 'done', 'discarded', 'expired'],
  })
    .notNull()
    .default('pending'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('nextAttemptAt').notNull().defaultNow(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
});

export type AgentTurn = InferSelectModel<typeof agentTurn>;

// The agent's handoff to a human (custom_outputs.handoff): why, its summary
// and the facts it verified. At most one open per chat; it closes when an
// advisor resolves the chat or hands it back to David.
export const handoff = createTable(
  'Handoff',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    reason: varchar('reason', { length: 64 }).notNull(),
    summary: text('summary'),
    facts: jsonb('facts').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    resolvedAt: timestamp('resolvedAt'),
  },
  (t) => [
    uniqueIndex('Handoff_open_chat')
      .on(t.chatId)
      .where(sql`"resolvedAt" is null`),
  ],
);

export type Handoff = InferSelectModel<typeof handoff>;
