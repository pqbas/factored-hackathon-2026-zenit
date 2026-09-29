// The advisor console on the back's advisor API (/api/advisor/conversations),
// back/spec/28-09-26-consola-asesor/requirements.md §1.

import type { Chat, DBMessage } from '@chat-template/db';

import { ASSISTANT_NAME } from '@/lib/assistant';
import { type AgentHandoff, HANDOFF_REASONS, handoffReasonLabel, NO_HANDOFF_GROUP } from '@/lib/handoff-case';
import { type ConversationStatus, STATUS_LABEL } from '@/lib/conversations';

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
    // The bank customer behind the chat (e.g. "Javier Molina Morales"); null
    // without a customer session or until the warehouse answers.
    | 'customerName'
  >
> & {
  // The latest case David handed off in this conversation (null: none), and
  // whether it is still open.
  handoff?: AgentHandoff | null;
  hasHandoff?: boolean;
  // Preview of the customer's last message (plain text, ≤140 chars).
  lastMessage?: {
    text: string;
    senderType: SenderType | null;
    createdAt: string;
  } | null;
};

// A row of the inbox: one per customer, carrying their most recent
// conversation (?groupBy=customer).
export type InboxItem = AdvisorChat & {
  // customerId, else userEmail, else userId: plain text, stable per customer.
  customerKey?: string;
  conversationCount?: number;
  // When that conversation last had a message.
  updatedAt?: string;
};

export interface AdvisorChatPage {
  chats: InboxItem[];
  hasMore: boolean;
}

// Which customer a row stands for; the chat id for rows without a key.
export function customerKeyOf(item: InboxItem): string {
  return item.customerKey ?? item.id;
}

export function customerConversationsUrl(customerKey: string): string {
  return `/api/advisor/customers/${encodeURIComponent(customerKey)}/conversations`;
}

// Every conversation of a customer, oldest first.
export async function fetchCustomerConversations(url: string): Promise<AdvisorChat[]> {
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 204 || res.status === 404) return [];
  if (!res.ok) throw new AdvisorRequestError(res.status);
  const body = (await res.json()) as { chats?: AdvisorChat[] };
  return body.chats ?? [];
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

// The view of the chats David handles on his own. The rows' state keeps its
// flow name ("Con AI", STATUS_LABEL.assistant).
export const DAVID_VIEW_LABEL = 'Agente AI';

// What the inbox shows: the open cases that need a person, one handoff reason,
// the chats David handles on his own, or a state.
export type InboxView =
  | { kind: 'inbox' }
  | { kind: 'david' }
  | { kind: 'reason'; reason: string }
  | { kind: 'waiting' }
  | { kind: 'advisor' }
  | { kind: 'resolved' };

export function viewUrl(
  view: InboxView,
  { startingAfter, userId }: { startingAfter?: string; userId?: string | null } = {},
): string {
  // One row per customer: views filter on each customer's latest conversation.
  const params = new URLSearchParams({ limit: String(INBOX_PAGE_SIZE), groupBy: 'customer' });
  params.set('status', view.kind === 'resolved' ? 'closed' : 'open');
  if (view.kind === 'reason') params.set('handoffReason', view.reason);
  if (view.kind === 'waiting') params.set('handledBy', 'human_queue');
  if (view.kind === 'david') params.set('handledBy', 'ai_agent');
  if (view.kind === 'advisor') params.set('handledBy', 'human_agent');
  if (userId) params.set('userId', userId);
  if (startingAfter) params.set('starting_after', startingAfter);
  return `${BASE}?${params.toString()}`;
}

export function sameView(a: InboxView, b: InboxView): boolean {
  return (
    a.kind === b.kind &&
    (a.kind !== 'reason' || a.reason === (b as { reason: string }).reason)
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
    .join('\n\n');
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

// The bank customer's name, else the app user's email as before.
export function customerLabel(chat: AdvisorChat): string {
  return chat.customerName?.trim() || chat.userEmail || 'Cliente sin email';
}

// The app user's email, shown small under a bank customer's name.
export function secondaryEmail(chat: AdvisorChat): string | null {
  return chat.customerName?.trim() && chat.userEmail ? chat.userEmail : null;
}

// The agent's intents (agent/configs/routing.yaml) that segment a
// conversation, in the order the inbox lists them. Small talk and out-of-scope
// turns aren't a use case: those chats go to "Otras".
export const USE_CASES = [
  { id: 'COMPLAINT', label: 'Reclamo' },
  { id: 'GENERAL_INQUIRY', label: 'Consultas generales' },
  { id: 'CASE_STATUS', label: 'Estado de un reclamo' },
  { id: 'HUMAN_AGENT', label: 'Pidió un asesor' },
  { id: 'COMMERCIAL', label: 'Comercial' },
  // Both are "Cancelación de producto", like the handoff reason.
  { id: 'RETENTION', label: 'Cancelación de producto' },
  { id: 'CANCEL', label: 'Cancelación de producto' },
] as const;

export const OTHER_GROUP = 'OTHER';


export function useCaseLabelOf(id: string): string {
  if (id === OTHER_GROUP) return 'Otras';
  return USE_CASES.find((u) => u.id === id)?.label ?? id;
}

// The header chip: the handoff reason if the conversation was handed off,
// else the Agente AI section of its use case; nothing for "Otros".
export function reasonTagOf(chat: AdvisorChat): string | null {
  const id = chat.handoff?.reason || davidSectionOf(chat);
  return id === NO_HANDOFF_GROUP ? null : id;
}

// Inbox sections: the three handoff reasons in HANDOFF_REASONS order, then
// unknown ones, then "Otros" (no handoff). Chats keep their order (newest
// first) inside each section.
// Agente AI has no handoff yet: its sections follow what David is working on
// (the ongoing conversation's use case), named like the Bandeja's reasons.
export const GENERAL_SECTION = 'general';
const DAVID_SECTION_OF: Record<string, string> = {
  COMPLAINT: 'complaint',
  RETENTION: 'retention',
  CANCEL: 'retention',
  CASE_STATUS: 'case_status',
  GENERAL_INQUIRY: GENERAL_SECTION,
};
const DAVID_SECTIONS = ['complaint', 'retention', 'case_status', GENERAL_SECTION, NO_HANDOFF_GROUP];

export function davidSectionOf(chat: AdvisorChat): string {
  return (chat.useCase && DAVID_SECTION_OF[chat.useCase]) || NO_HANDOFF_GROUP;
}

export function groupByDavidSection<T extends AdvisorChat>(
  chats: T[],
): { id: string; label: string; chats: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const chat of chats) {
    const id = davidSectionOf(chat);
    groups.set(id, [...(groups.get(id) ?? []), chat]);
  }
  return DAVID_SECTIONS.filter((id) => groups.has(id)).map((id) => ({
    id,
    label: sectionLabel(id),
    chats: groups.get(id) ?? [],
  }));
}

export function sectionLabel(id: string): string {
  if (id === NO_HANDOFF_GROUP) return 'Otros';
  if (id === GENERAL_SECTION) return 'Consultas generales';
  return handoffReasonLabel(id);
}

export function groupByHandoffReason<T extends AdvisorChat>(
  chats: T[],
): { id: string; label: string; chats: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const chat of chats) {
    const id = chat.handoff?.reason || NO_HANDOFF_GROUP;
    groups.set(id, [...(groups.get(id) ?? []), chat]);
  }
  const known: string[] = HANDOFF_REASONS.map((r) => r.id);
  const order = [
    ...known,
    ...[...groups.keys()].filter((id) => !known.includes(id) && id !== NO_HANDOFF_GROUP),
    NO_HANDOFF_GROUP,
  ];
  return order
    .filter((id) => groups.has(id))
    .map((id) => ({
      id,
      label: id === NO_HANDOFF_GROUP ? 'Otros' : handoffReasonLabel(id),
      chats: groups.get(id) ?? [],
    }));
}

export type AttentionTone = 'assistant' | 'waiting' | 'mine' | 'other' | 'resolved';

// State worth showing: only when the chat needs attention or changes hands.
// "With David" is the normal case and shows nothing.
export function attentionOf(
  chat: AdvisorChat,
  me: string | undefined,
  // The row is short ("Tú", the advisor's name before the @); the open chat's
  // header spells it out.
  { long = false }: { long?: boolean } = {},
): { text: string; tone: AttentionTone } | null {
  if (chat.closedAt) return { text: STATUS_LABEL.resolved, tone: 'resolved' };
  if (chat.handledBy === 'human_queue') return { text: STATUS_LABEL.waiting, tone: 'waiting' };
  if (chat.handledBy === 'human_agent') {
    const tone = isMine(chat, me) ? 'mine' : 'other';
    // Rows name the advisor in their own column (holderLabel); the header
    // spells it out here.
    if (!long) return { text: STATUS_LABEL.advisor, tone };
    const holder = isMine(chat, me) ? 'la atiendes tú' : (chat.assignedTo ?? 'otro asesor');
    return { text: `${STATUS_LABEL.advisor} · ${holder}`, tone };
  }
  // Rows show David's chats with the robot; the header names the state.
  return long ? { text: STATUS_LABEL.assistant, tone: 'assistant' } : null;
}

// Who holds a chat an advisor took, for the row: "tú", or their user (the
// email before the @). null unless an advisor has it.
export function holderLabel(chat: AdvisorChat, me: string | undefined): string | null {
  if (chat.closedAt || chat.handledBy !== 'human_agent') return null;
  if (isMine(chat, me)) return 'tú';
  return chat.assignedTo ? chat.assignedTo.split('@')[0] : 'otro asesor';
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
// A handoff summary cut for a row: at most `max` characters, at a whole word,
// ending in "...". The full text stays in the tooltip and the context panel.
export function shortSummary(text: string, max = 60): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const end = cut.lastIndexOf(' ');
  const words = (end > 0 ? cut.slice(0, end) : clean.slice(0, max)).replace(/[\s.,;:·-]+$/, '');
  return `${words}...`;
}

// The row's preview: the handoff summary, short, while the case is open (it
// says why the customer is here), else the customer's last message.
export function rowPreview(chat: AdvisorChat): string {
  const summary = chat.hasHandoff ? chat.handoff?.summary : null;
  return summary ? shortSummary(summary) : rowText(chat);
}

export function lastActivityAt(chat: InboxItem): string {
  return chat.updatedAt ?? chat.lastMessage?.createdAt ?? chat.createdAt;
}

// How many conversations each view has, for the counters in the views sidebar.
export interface ViewCounts {
  inbox: number;
  david: number;
  waiting: number;
  advisor: number;
  resolved: number;
  reasons: Record<string, number>;
}

// Counters count customers, like the rows.
export function countsUrl(userId?: string | null): string {
  const params = new URLSearchParams({ groupBy: 'customer' });
  if (userId) params.set('userId', userId);
  const query = params.toString();
  return `${BASE}/counts${query ? `?${query}` : ''}`;
}

// The one place that knows the shape of GET /api/advisor/conversations/counts:
// { total, byHandoffReason, withAdvisor, unattended, resolved, aiAgent }.
// total is the open cases that need a person (the inbox); aiAgent the open
// chats David handles alone; withAdvisor the customers whose ongoing
// conversation is in human_agent. Missing or bad numbers read as 0.
export function parseCounts(body: unknown): ViewCounts {
  const raw = (body ?? {}) as {
    total?: unknown;
    aiAgent?: unknown;
    byHandoffReason?: Record<string, unknown>;
    unattended?: unknown;
    withAdvisor?: unknown;
    resolved?: unknown;
  };
  const n = (value: unknown) => (typeof value === 'number' && value > 0 ? value : 0);
  const reasons: Record<string, number> = {};
  for (const [id, value] of Object.entries(raw.byHandoffReason ?? {})) reasons[id] = n(value);
  return {
    inbox: n(raw.total),
    david: n(raw.aiAgent),
    waiting: n(raw.unattended),
    advisor: n(raw.withAdvisor),
    resolved: n(raw.resolved),
    reasons,
  };
}

export function countFor(view: InboxView, counts: ViewCounts | undefined): number {
  if (!counts) return 0;
  if (view.kind === 'reason') return counts.reasons[view.reason] ?? 0;
  return counts[view.kind];
}

export async function fetchCounts(url: string): Promise<ViewCounts | undefined> {
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 204 || !res.ok) return undefined;
  return parseCounts(await res.json());
}

// How long after the customer's message the console assumes David is still
// answering; past this, a missing reply means it failed, not that it's slow.
export const DAVID_REPLY_WINDOW_MS = 60_000;

// David handles the chat and the customer's last message has no reply yet.
export function isDavidReplying(chat: AdvisorChat, bubbles: Bubble[], now: Date): boolean {
  if (statusOf(chat) !== 'assistant') return false;
  const last = [...bubbles].reverse().find((bubble) => bubble.from !== 'system');
  if (!last || last.from !== 'customer') return false;
  return now.getTime() - new Date(last.sentAt).getTime() < DAVID_REPLY_WINDOW_MS;
}
