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

// An advisor may take the chat while the agent is still streaming a reply.
// When that happens, the reply must not be saved and its custom_outputs must
// not be applied: the conversation is no longer the agent's to answer.
export function shouldPersistAgentReply(handledBy: Chat['handledBy']): boolean {
  return handledBy === 'ai_agent';
}
