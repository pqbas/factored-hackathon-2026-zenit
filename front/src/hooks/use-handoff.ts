import type { ChatMessage } from '@chat-template/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchHandledBy,
  fetchNewMessages,
  HANDOFF_POLL_MS,
  STATE_POLL_MS,
  type HandledBy,
  mergeNewMessages,
} from '@/lib/handoff';

// Who handles this chat, and the advisor's messages while it isn't the agent:
// polls GET /api/messages/:id?after=<last id> and GET /api/chat/:id every
// HANDOFF_POLL_MS until the conversation is back with the agent. With the
// agent, only the state is checked every STATE_POLL_MS, so a take by an
// advisor shows up even if the customer doesn't write.
export function useHandoff({
  chatId,
  initialHandledBy,
  messages,
  setMessages,
  enabled,
}: {
  chatId: string;
  initialHandledBy: HandledBy;
  messages: ChatMessage[];
  setMessages: (update: (current: ChatMessage[]) => ChatMessage[]) => void;
  enabled: boolean;
}) {
  const [handledBy, setHandledBy] = useState<HandledBy>(initialHandledBy);
  const lastIdRef = useRef<string | undefined>(undefined);
  lastIdRef.current = messages.at(-1)?.id;

  const refreshState = useCallback(async () => {
    try {
      const next = await fetchHandledBy(chatId);
      if (next) setHandledBy(next);
    } catch {
      // The next poll retries.
    }
  }, [chatId]);

  const pollMessages = useCallback(async () => {
    try {
      const result = await fetchNewMessages(chatId, lastIdRef.current);
      if (!result) return;
      setMessages((current) =>
        mergeNewMessages(result.full ? [] : current, result.messages),
      );
    } catch {
      // The next poll retries.
    }
  }, [chatId, setMessages]);

  // Only saved chats have a state to check.
  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (!enabled || !hasMessages) return;
    if (handledBy === 'ai_agent') {
      const timer = setInterval(refreshState, STATE_POLL_MS);
      return () => clearInterval(timer);
    }
    const tick = () => {
      pollMessages();
      refreshState();
    };
    // Catch up right away when a person takes over (e.g. the "Te atiende un
    // asesor" notice), then keep polling.
    pollMessages();
    const timer = setInterval(tick, HANDOFF_POLL_MS);
    return () => clearInterval(timer);
  }, [enabled, hasMessages, handledBy, pollMessages, refreshState]);

  return { handledBy, setHandledBy, refreshState };
}
