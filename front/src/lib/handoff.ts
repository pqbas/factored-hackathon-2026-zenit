// The customer's chat while a person (not the agent) handles the conversation.
// The back answers POST /api/chat with only a `data-conversation-state` part,
// and the advisor's messages arrive by polling GET /api/messages/:id?after=.

import type { ChatMessage } from '@chat-template/core';
import type { Chat } from '@chat-template/db';

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
    (part) => part.type !== 'data-conversation-state' && part.type !== 'step-start',
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

export function handoffNotice(handledBy: HandledBy): string | null {
  if (handledBy === 'human_queue') {
    return 'Te pasamos con un asesor. Te va a responder en este chat.';
  }
  if (handledBy === 'human_agent') return 'Te atiende un asesor.';
  return null;
}

export async function fetchHandledBy(chatId: string): Promise<HandledBy | null> {
  const res = await fetch(`/api/chat/${chatId}`, { credentials: 'include' });
  if (!res.ok) return null;
  return handledByOf((await res.json()).handledBy);
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
