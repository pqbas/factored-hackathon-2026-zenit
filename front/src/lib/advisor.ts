// The advisor console on the back's advisor API (/api/advisor/conversations),
// back/spec/28-09-26-consola-asesor/requirements.md §1.

import type { Chat, DBMessage } from '@chat-template/db';

import { ASSISTANT_NAME } from '@/lib/assistant';
import type { ConversationStatus } from '@/lib/conversations';

// Row types from @chat-template/db as they arrive over JSON: dates are strings.
type OverJson<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export type HandledBy = Chat['handledBy'];

export type AdvisorChat = OverJson<
  Pick<
    Chat,
    | 'id'
    | 'title'
    | 'createdAt'
    | 'userId'
    | 'userEmail'
    | 'handledBy'
    | 'assignedTo'
    | 'assignedAt'
    | 'closedAt'
    | 'useCase'
  >
> & {
  // Preview of the customer's last message (plain text, ≤140 chars).
  lastMessage?: {
    text: string;
    senderType: SenderType | null;
    createdAt: string;
  } | null;
};

export interface AdvisorChatPage {
  chats: AdvisorChat[];
  hasMore: boolean;
}

export type SenderType = NonNullable<DBMessage['senderType']>;

export type AdvisorMessage = OverJson<
  Pick<DBMessage, 'id' | 'chatId' | 'role' | 'createdAt' | 'senderType' | 'senderId'>
> & {
  // null senderType: saved before the console existed; read it by role.
  parts: { type: string; text?: string }[];
};

export const POLL_MS = 4000;
export const INBOX_PAGE_SIZE = 20;

export const QUICK_REPLIES = [
  'Ya revisé tu caso.',
  'La transferencia se acredita en 24 h hábiles.',
  'Abrí un reclamo y te aviso por aquí cuando tenga respuesta.',
  '¿Hay algo más en lo que te pueda ayudar?',
];

const BASE = '/api/advisor/conversations';

// What the inbox shows: everything open, one use case, or a state.
export type InboxView =
  | { kind: 'inbox' }
  | { kind: 'useCase'; useCase: string }
  | { kind: 'waiting' }
  | { kind: 'mine' }
  | { kind: 'resolved' };

export function viewUrl(
  view: InboxView,
  { startingAfter, userId }: { startingAfter?: string; userId?: string | null } = {},
): string {
  const params = new URLSearchParams({ limit: String(INBOX_PAGE_SIZE) });
  params.set('status', view.kind === 'resolved' ? 'closed' : 'open');
  if (view.kind === 'useCase') params.set('useCase', view.useCase);
  if (view.kind === 'waiting') params.set('handledBy', 'human_queue');
  if (view.kind === 'mine') params.set('assignedTo', 'me');
  if (userId) params.set('userId', userId);
  if (startingAfter) params.set('starting_after', startingAfter);
  return `${BASE}?${params.toString()}`;
}

export function sameView(a: InboxView, b: InboxView): boolean {
  return (
    a.kind === b.kind &&
    (a.kind !== 'useCase' || a.useCase === (b as { useCase: string }).useCase)
  );
}

export function messagesUrl(chatId: string, after?: string): string {
  return `${BASE}/${chatId}/messages${after ? `?after=${after}` : ''}`;
}

export function statusOf(chat: AdvisorChat): ConversationStatus {
  if (chat.closedAt) return 'resolved';
  if (chat.handledBy === 'human_queue') return 'waiting';
  if (chat.handledBy === 'human_agent') return 'advisor';
  return 'assistant';
}

// Emails are compared without case: ADMIN_EMAILS/ADVISOR_EMAILS ignore it and
// the back stores whatever casing X-Forwarded-Email carried.
export function sameEmail(a: string | null | undefined, b: string | null | undefined) {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function isMine(chat: AdvisorChat, me: string | undefined): boolean {
  return !chat.closedAt && sameEmail(chat.assignedTo, me);
}

// Two people never answer the same chat: only whoever holds it can write.
export function canReply(chat: AdvisorChat, me: string | undefined): boolean {
  return isMine(chat, me);
}

export function isHeldByOther(chat: AdvisorChat, me: string | undefined) {
  return !chat.closedAt && !!chat.assignedTo && !sameEmail(chat.assignedTo, me);
}

// Appends only messages not seen yet, keeping arrival order.
export function mergeMessages(
  current: AdvisorMessage[],
  incoming: AdvisorMessage[],
): AdvisorMessage[] {
  const seen = new Set(current.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  return fresh.length ? [...current, ...fresh] : current;
}

export type BubbleFrom = 'customer' | 'assistant' | 'advisor' | 'system';

export interface Bubble {
  id: string;
  from: BubbleFrom;
  label: string | null;
  text: string;
  sentAt: string;
}

export function toBubble(message: AdvisorMessage, me: string | undefined): Bubble {
  const text = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('');
  const base = { id: message.id, text, sentAt: message.createdAt };
  const sender: SenderType =
    message.senderType ??
    (message.role === 'user'
      ? 'customer'
      : message.role === 'system'
        ? 'system'
        : 'ai_agent');
  switch (sender) {
    case 'customer':
      return { ...base, from: 'customer', label: null };
    case 'system':
      return { ...base, from: 'system', label: null };
    case 'human_agent':
      return {
        ...base,
        from: 'advisor',
        label: sameEmail(message.senderId, me) ? 'Tú' : (message.senderId ?? 'Asesor'),
      };
    default:
      return { ...base, from: 'assistant', label: ASSISTANT_NAME };
  }
}

export function customerLabel(chat: AdvisorChat): string {
  return chat.userEmail || 'Cliente sin email';
}

// The agent's intents (agent/configs/routing.yaml) that segment a
// conversation, in the order the inbox lists them. Small talk and out-of-scope
// turns aren't a use case: those chats go to "Otras".
export const USE_CASES = [
  { id: 'COMPLAINT', label: 'Reclamo' },
  { id: 'GENERAL_INQUIRY', label: 'Consultas generales' },
  { id: 'CASE_STATUS', label: 'Estado de un caso' },
  { id: 'HUMAN_AGENT', label: 'Pidió un asesor' },
  { id: 'COMMERCIAL', label: 'Comercial' },
  { id: 'RETENTION', label: 'Retención' },
  { id: 'CANCEL', label: 'Cancelación' },
] as const;

const NOT_A_USE_CASE = new Set(['GREETING', 'GOODBYE', 'OUT_OF_SCOPE']);
export const OTHER_GROUP = 'OTHER';

// The use case a chat is filed under: a known id, an unknown one as-is, or
// OTHER_GROUP when there is none.
export function useCaseOf(chat: AdvisorChat): string {
  if (!chat.useCase || NOT_A_USE_CASE.has(chat.useCase)) return OTHER_GROUP;
  return chat.useCase;
}

export function useCaseLabelOf(id: string): string {
  if (id === OTHER_GROUP) return 'Otras';
  return USE_CASES.find((u) => u.id === id)?.label ?? id;
}

export function useCaseTag(chat: AdvisorChat): string | null {
  const id = useCaseOf(chat);
  return id === OTHER_GROUP ? null : useCaseLabelOf(id);
}

// Inbox sections: known use cases in USE_CASES order, then unknown ones, then
// "Otras". Chats keep their order (newest first) inside each section.
export function groupByUseCase(
  chats: AdvisorChat[],
): { id: string; label: string; chats: AdvisorChat[] }[] {
  const groups = new Map<string, AdvisorChat[]>();
  for (const chat of chats) {
    const id = useCaseOf(chat);
    groups.set(id, [...(groups.get(id) ?? []), chat]);
  }
  const known: string[] = USE_CASES.map((u) => u.id);
  const order = [
    ...known,
    ...[...groups.keys()].filter((id) => !known.includes(id) && id !== OTHER_GROUP),
    OTHER_GROUP,
  ];
  return order
    .filter((id) => groups.has(id))
    .map((id) => ({ id, label: useCaseLabelOf(id), chats: groups.get(id) ?? [] }));
}

export type AttentionTone = 'waiting' | 'mine' | 'other' | 'resolved';

// State worth showing: only when the chat needs attention or changes hands.
// "With David" is the normal case and shows nothing.
export function attentionOf(
  chat: AdvisorChat,
  me: string | undefined,
  // The row is short ("Tú", the advisor's name before the @); the open chat's
  // header spells it out.
  { long = false }: { long?: boolean } = {},
): { text: string; tone: AttentionTone } | null {
  if (chat.closedAt) return { text: 'Resuelta', tone: 'resolved' };
  if (chat.handledBy === 'human_queue') return { text: 'Sin atender', tone: 'waiting' };
  if (chat.handledBy === 'human_agent') {
    return isMine(chat, me)
      ? { text: long ? 'La atiendes tú' : 'Tú', tone: 'mine' }
      : {
          text: `La atiende ${
            chat.assignedTo
              ? long
                ? chat.assignedTo
                : chat.assignedTo.split('@')[0]
              : 'otro asesor'
          }`,
          tone: 'other',
        };
  }
  return null;
}

export class AdvisorRequestError extends Error {
  constructor(public status: number) {
    super(`Advisor API responded ${status}`);
  }
}

async function post(url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

export type TakeResult =
  | { ok: true; chat: AdvisorChat }
  | { ok: false; assignedTo: string | null };

export async function takeConversation(chatId: string): Promise<TakeResult> {
  const res = await post(`${BASE}/${chatId}/take`);
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, assignedTo: body.assignedTo ?? null };
  }
  if (!res.ok) throw new AdvisorRequestError(res.status);
  return { ok: true, chat: (await res.json()).chat };
}

export type ReplyResult =
  | { ok: true; message: AdvisorMessage }
  | { ok: false; conflict: true };

export async function replyToConversation(
  chatId: string,
  text: string,
): Promise<ReplyResult> {
  const res = await post(`${BASE}/${chatId}/messages`, { text });
  if (res.status === 409) return { ok: false, conflict: true };
  if (!res.ok) throw new AdvisorRequestError(res.status);
  return { ok: true, message: (await res.json()).message };
}

export type ReleaseResult =
  | { ok: true; chat: AdvisorChat }
  | { ok: false; conflict: true };

// 409 when someone else holds it (or nobody does).
export async function releaseConversation(
  chatId: string,
  outcome: 'returned_to_agent' | 'resolved',
): Promise<ReleaseResult> {
  const res = await post(`${BASE}/${chatId}/release`, { outcome });
  if (res.status === 409) return { ok: false, conflict: true };
  if (!res.ok) throw new AdvisorRequestError(res.status);
  return { ok: true, chat: (await res.json()).chat };
}

// Full list on first load; afterwards only messages after the last one. An
// unknown `after` (400) falls back to the full list.
export async function fetchMessages(
  chatId: string,
  after?: string,
): Promise<{ messages: AdvisorMessage[]; full: boolean }> {
  const res = await fetch(messagesUrl(chatId, after), { credentials: 'include' });
  if (after && res.status === 400) {
    return { messages: (await fetchMessages(chatId)).messages, full: true };
  }
  if (res.status === 204) return { messages: [], full: true };
  if (!res.ok) throw new AdvisorRequestError(res.status);
  return { messages: await res.json(), full: !after };
}

export async function fetchInbox(url: string): Promise<AdvisorChatPage> {
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 204) return { chats: [], hasMore: false };
  if (!res.ok) throw new AdvisorRequestError(res.status);
  return res.json();
}

export interface ChatOwner {
  userId: string;
  userEmail: string | null;
}

// Owners of conversations, for the admin's user filter (admin only).
export async function fetchUsers(): Promise<ChatOwner[]> {
  const res = await fetch('/api/advisor/users', { credentials: 'include' });
  if (res.status === 204 || !res.ok) return [];
  return (await res.json()).users ?? [];
}

// The row's text: the last message the customer sent, falling back to the
// chat title (their first message) when the back has none.
export function rowText(chat: AdvisorChat): string {
  return chat.lastMessage?.text?.trim() || chat.title;
}

// When the row last moved: the customer's last message, else the chat start.
export function lastActivityAt(chat: AdvisorChat): string {
  return chat.lastMessage?.createdAt ?? chat.createdAt;
}

// How many conversations each view has, for the counters in the views sidebar.
export interface ViewCounts {
  inbox: number;
  waiting: number;
  mine: number;
  resolved: number;
  useCases: Record<string, number>;
}

export function countsUrl(userId?: string | null): string {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  const query = params.toString();
  return `${BASE}/counts${query ? `?${query}` : ''}`;
}

// The one place that knows the shape of GET /api/advisor/conversations/counts:
// { total, byUseCase, withoutUseCase, unattended, mine, resolved }. total is
// the open chats (the inbox); mine is always 0 for the admin. Missing or bad
// numbers read as 0.
export function parseCounts(body: unknown): ViewCounts {
  const raw = (body ?? {}) as {
    total?: unknown;
    byUseCase?: Record<string, unknown>;
    unattended?: unknown;
    mine?: unknown;
    resolved?: unknown;
  };
  const n = (value: unknown) => (typeof value === 'number' && value > 0 ? value : 0);
  const useCases: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw.byUseCase ?? {})) useCases[id] = n(value);
  return {
    inbox: n(raw.total),
    waiting: n(raw.unattended),
    mine: n(raw.mine),
    resolved: n(raw.resolved),
    useCases,
  };
}

export function countFor(view: InboxView, counts: ViewCounts | undefined): number {
  if (!counts) return 0;
  if (view.kind === 'useCase') return counts.useCases[view.useCase] ?? 0;
  return counts[view.kind];
}

export async function fetchCounts(url: string): Promise<ViewCounts | undefined> {
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 204 || !res.ok) return undefined;
  return parseCounts(await res.json());
}
