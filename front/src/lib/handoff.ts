// The customer's chat while a person (not the agent) handles the conversation.
// The back answers POST /api/chat with only a `data-conversation-state` part,
// and the advisor's messages arrive by polling GET /api/messages/:id?after=.

import type { ChatMessage } from '@chat-template/core';
import type { Chat } from '@chat-template/db';

import { type Lang, MESSAGES } from '@/lib/i18n';
import { convertToUIMessages } from '@/lib/utils';

export type HandledBy = Chat['handledBy'];

export const HANDOFF_POLL_MS = 4000;
// While the agent handles the chat, only its state is checked, less often: an
// advisor can take a conversation the customer isn't writing in.
export const STATE_POLL_MS = 10000;

export function handledByOf(value: unknown): HandledBy {
  return value === 'human_queue' || value === 'human_agent' ? value : 'ai_agent';
}

// An assistant message made only of the conversation-state part (plus stream
// bookkeeping): nothing to show, so it is dropped from the chat.
export function isStateOnlyMessage(message: ChatMessage | undefined): boolean {
  if (!message || message.role !== 'assistant') return false;
  const visible = message.parts.filter(
    (part) =>
      part.type !== 'data-conversation-state' &&
      (part.type as string) !== AGENT_PENDING_EVENT &&
      part.type !== 'step-start',
  );
  return visible.length === 0;
}

// Appends only messages not in the chat yet, keeping arrival order.
export function mergeNewMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const seen = new Set(current.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  return fresh.length ? [...current, ...fresh] : current;
}

// Who wrote a saved message. Messages from before the console have no
// senderType and are read by role.
export function senderOf(
  message: ChatMessage,
): 'customer' | 'agent' | 'advisor' | 'system' {
  const senderType = (message.metadata as { senderType?: string } | undefined)
    ?.senderType;
  if (senderType === 'human_agent') return 'advisor';
  if (senderType === 'system' || message.role === 'system') return 'system';
  if (senderType === 'customer' || message.role === 'user') return 'customer';
  return 'agent';
}

export function handoffNotice(handledBy: HandledBy, lang: Lang = 'es'): string | null {
  if (handledBy === 'human_queue') return MESSAGES[lang].handoffQueued;
  if (handledBy === 'human_agent') return MESSAGES[lang].handoffTaken;
  return null;
}

export async function fetchHandledBy(chatId: string): Promise<HandledBy | null> {
  return (await fetchChatState(chatId))?.handledBy ?? null;
}

// Who handles the chat, and whether a customer turn waits in the queue for
// the agent (agentPending; null when the back doesn't say).
export async function fetchChatState(
  chatId: string,
): Promise<{ handledBy: HandledBy; agentPending: boolean | null } | null> {
  const res = await fetch(`/api/chat/${chatId}`, { credentials: 'include' });
  if (!res.ok) return null;
  const body = await res.json();
  return {
    handledBy: handledByOf(body.handledBy),
    agentPending: typeof body.agentPending === 'boolean' ? body.agentPending : null,
  };
}

// The agent was unavailable: the back queued the customer's turn and David
// answers when it's back (the answer arrives through GET /api/messages).
export const AGENT_PENDING_EVENT = 'data-agent-pending';

// A queued turn is over once anything but the customer shows up after it:
// David's answer, or a system notice (expired, taken by an advisor).
export function endsAgentPending(incoming: ChatMessage[]): boolean {
  return incoming.some((m) => senderOf(m) !== 'customer');
}

// Messages after `after`, or all of them (`full`) when there is no `after` or
// the back doesn't know it (400). null when there is nothing to read.
export async function fetchNewMessages(
  chatId: string,
  after: string | undefined,
): Promise<{ messages: ChatMessage[]; full: boolean } | null> {
  let res = await fetch(`/api/messages/${chatId}${after ? `?after=${after}` : ''}`, {
    credentials: 'include',
  });
  let full = !after;
  if (after && res.status === 400) {
    res = await fetch(`/api/messages/${chatId}`, { credentials: 'include' });
    full = true;
  }
  if (!res.ok || res.status === 204) return null;
  return { messages: convertToUIMessages(await res.json()), full };
}

// Where "David está escribiendo" shows, from the moment the customer sends
// until David's first text: inside David's message once it exists (the
// stream's `start` creates it empty, and the chat stays `submitted` until
// content arrives), else at the end of the list. Null when David owes nothing
// or a person handles the chat. A queued turn (agentPending) counts: David
// answers on his own, and the reply comes by polling.
export function isAwaitingDavid({
  status,
  messages,
  handledBy,
  agentPending,
}: {
  status: string;
  messages: ChatMessage[];
  handledBy: HandledBy;
  agentPending: boolean;
}): 'message' | 'list' | null {
  if (handledBy !== 'ai_agent') return null;
  const last = messages.at(-1);
  if (!last) return null;
  const sender = senderOf(last);
  const busy = status === 'submitted' || status === 'streaming';
  if (sender === 'customer') return busy || agentPending ? 'list' : null;
  if (sender === 'agent' && busy) {
    const hasText = last.parts.some((part) => part.type === 'text' && part.text.length > 0);
    return hasText ? null : 'message';
  }
  return null;
}
