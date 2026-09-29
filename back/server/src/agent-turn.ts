import type { ChatMessage } from '@chat-template/core';
import type { Chat } from '@chat-template/db';

const ADVISOR_PREFIX = '[Asesor] ';

// The copy of the chat history sent to the agent: excludes system notices and
// blocked turns, and prefixes the advisor's own replies so the agent can tell
// them apart from its own. Built fresh for each request, never persisted and
// never shown to the front.
export function buildAgentHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.role !== 'system' && m.metadata?.blocked !== true)
    .map((m) => {
      if (m.metadata?.senderType !== 'human_agent') return m;
      return {
        ...m,
        parts: m.parts.map((part) =>
          part.type === 'text'
            ? { ...part, text: `${ADVISOR_PREFIX}${part.text}` }
            : part,
        ),
      };
    });
}

// A conversation is paused (David says nothing, nothing of his is saved)
// while a handoff is open or a human owns it. Both normally change together;
// checking both covers chats that predate the Handoff table.
export function isPaused({
  handledBy,
  hasOpenHandoff,
}: {
  handledBy: Chat['handledBy'];
  hasOpenHandoff: boolean;
}): boolean {
  return handledBy !== 'ai_agent' || hasOpenHandoff;
}

// Stable prefixes of the agent's fixed handoff phrases (es, pt) in
// agent/src/prompts/messages.py; the phrase ends at its first period.
const HANDOFF_PHRASES = [
  'Te comunico con un asesor',
  'Vou transferir você para um atendente',
];

// Keeps the reply up to the handoff message, inclusive: text David adds after
// it in the same turn is dropped. Parts without the phrase are returned as is.
export function trimAfterHandoff<T extends { type: string }>(parts: T[]): T[] {
  for (const [index, part] of parts.entries()) {
    const text = (part as { text?: unknown }).text;
    if (part.type !== 'text' || typeof text !== 'string') continue;

    const start = HANDOFF_PHRASES.map((p) => text.indexOf(p)).find(
      (i) => i !== -1,
    );
    if (start === undefined) continue;

    const period = text.indexOf('.', start);
    const trimmed = period === -1 ? text : text.slice(0, period + 1);
    return [...parts.slice(0, index), { ...part, text: trimmed }];
  }
  return parts;
}

// An advisor may take the chat while the agent is still streaming a reply.
// When that happens, the reply must not be saved and its custom_outputs must
// not be applied: the conversation is no longer the agent's to answer.
export function shouldPersistAgentReply(handledBy: Chat['handledBy']): boolean {
  return handledBy === 'ai_agent';
}
