// The advisor console on the back's advisor API (/api/advisor/conversations).
// Types follow back/spec/28-09-26-consola-asesor/requirements.md §1; swap them
// for the ones in @chat-template/db once the back ships them.

import type { ConversationStatus } from '@/lib/conversations';

export type HandledBy = 'ai_agent' | 'human_queue' | 'human_agent';

export interface AdvisorChat {
  id: string;
  title: string;
  createdAt: string;
  userId: string;
  userEmail: string | null;
  handledBy: HandledBy;
  assignedTo: string | null;
  assignedAt: string | null;
  closedAt: string | null;
  useCase: string | null;
}

export interface AdvisorChatPage {
  chats: AdvisorChat[];
  hasMore: boolean;
}

export type SenderType = 'customer' | 'ai_agent' | 'human_agent' | 'system';

export interface AdvisorMessage {
  id: string;
  chatId: string;
  role: string;
  parts: { type: string; text?: string }[];
  createdAt: string;
  // null on messages saved before the console existed: read them by role.
  senderType: SenderType | null;
  senderId: string | null;
}

export type InboxFilter = 'open' | 'waiting' | 'mine' | 'assistant' | 'closed';

export const INBOX_FILTERS: { id: InboxFilter; label: string }[] = [
  { id: 'open', label: 'Abiertas' },
  { id: 'waiting', label: 'Sin atender' },
  { id: 'mine', label: 'Mías' },
  { id: 'assistant', label: 'Con asistente' },
  { id: 'closed', label: 'Cerradas' },
];

export const POLL_MS = 4000;
export const INBOX_PAGE_SIZE = 20;

export const QUICK_REPLIES = [
  'Ya revisé tu caso.',
  'La transferencia se acredita en 24 h hábiles.',
  'Abrí un reclamo y te aviso por aquí cuando tenga respuesta.',
  '¿Hay algo más en lo que te pueda ayudar?',
];

const BASE = '/api/advisor/conversations';

export function inboxUrl(filter: InboxFilter, startingAfter?: string): string {
  const params = new URLSearchParams({ limit: String(INBOX_PAGE_SIZE) });
  params.set('status', filter === 'closed' ? 'closed' : 'open');
  if (filter === 'waiting') params.set('handledBy', 'human_queue');
  if (filter === 'assistant') params.set('handledBy', 'ai_agent');
  if (filter === 'mine') params.set('assignedTo', 'me');
  if (startingAfter) params.set('starting_after', startingAfter);
  return `${BASE}?${params.toString()}`;
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

// Two people never answer the same chat: only whoever holds it can write.
export function canReply(chat: AdvisorChat, me: string | undefined): boolean {
  return !chat.closedAt && !!me && chat.assignedTo === me;
}

export function isHeldByOther(chat: AdvisorChat, me: string | undefined) {
  return !chat.closedAt && !!chat.assignedTo && chat.assignedTo !== me;
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
        label: message.senderId === me ? 'Tú' : (message.senderId ?? 'Asesor'),
      };
    default:
      return { ...base, from: 'assistant', label: 'Asistente' };
  }
}

export function customerLabel(chat: AdvisorChat): string {
  return chat.userEmail || 'Cliente sin email';
}

export function useCaseLabel(chat: AdvisorChat): string {
  return chat.useCase || 'Sin caso de uso';
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

export async function takeConversation(
  chatId: string,
  force = false,
): Promise<TakeResult> {
  const res = await post(`${BASE}/${chatId}/take`, force ? { force: true } : {});
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
