import {
  convertToModelMessages,
  streamText,
  type LanguageModelUsage,
} from 'ai';
import type { LanguageModelV3Usage } from '@ai-sdk/provider';
import {
  getChatById,
  markMessagesBlocked,
  resolveChatByAgent,
  saveMessages,
  updateChatAgentState,
  updateChatLastContextById,
  openHandoff,
  hasOpenHandoff,
  cancelAgentTurns,
  type DBMessage,
} from '@chat-template/db';
import {
  type ChatMessage,
  myProvider,
  CONTEXT_HEADER_CONVERSATION_ID,
  CONTEXT_HEADER_USER_ID,
  CONTEXT_HEADER_SESSION_TOKEN,
  CONTEXT_HEADER_HANDLED_BY,
  getAndClearAgentOutputs,
} from '@chat-template/core';
import { isAgentUnavailableError } from '@chat-template/ai-sdk-providers';
import { buildAgentHistory, isPaused, trimAfterHandoff } from './agent-turn';

// Convert ai's LanguageModelUsage to @ai-sdk/provider's LanguageModelV3Usage
function toV3Usage(usage: LanguageModelUsage): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: usage.inputTokens,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: usage.outputTokens,
      text: undefined,
      reasoning: undefined,
    },
  };
}

// One agent turn over the chat history, used by POST /api/chat (streamed to
// the front) and by the queue worker (consumed in the back).
export async function streamAgentTurn({
  chatId,
  userId,
  sessionToken,
  handledBy = 'ai_agent',
  messages,
  selectedChatModel = 'chat-model',
  onUsage,
}: {
  chatId: string;
  userId: string;
  sessionToken?: string | null;
  handledBy?: string;
  messages: ChatMessage[];
  selectedChatModel?: string;
  onUsage?: (usage: LanguageModelUsage) => void;
}) {
  // Blocked turns and system notices are kept for the chat history but
  // never resent to the agent; advisor replies go out prefixed so the agent
  // can tell them apart from its own (never persisted, never shown to the
  // front).
  const modelMessages = buildAgentHistory(messages);
  const model = await myProvider.languageModel(selectedChatModel);
  return streamText({
    model,
    messages: await convertToModelMessages(modelMessages),
    headers: {
      [CONTEXT_HEADER_CONVERSATION_ID]: chatId,
      [CONTEXT_HEADER_USER_ID]: userId,
      ...(sessionToken ? { [CONTEXT_HEADER_SESSION_TOKEN]: sessionToken } : {}),
      [CONTEXT_HEADER_HANDLED_BY]: handledBy,
    },
    onFinish: ({ usage }) => onUsage?.(usage),
    // An unavailable agent is expected (the turn gets queued), not an error.
    onError: ({ error }) => {
      if (!isAgentUnavailableError(error)) console.error('Agent error:', error);
    },
  });
}

// Saves the agent's reply and applies its custom_outputs. Returns false (and
// saves nothing) when the conversation is paused (an advisor took the chat
// while the agent was answering, or a handoff is open) or the agent itself
// answered `paused`: it's no longer the agent's conversation to answer.
export async function persistAgentReply({
  chatId,
  customerMessageId,
  reply,
  usage,
}: {
  chatId: string;
  customerMessageId?: string;
  reply: Pick<DBMessage, 'id' | 'role' | 'parts'>;
  usage?: LanguageModelUsage;
}): Promise<boolean> {
  const freshChat = await getChatById({ id: chatId });
  const agentOutputs = getAndClearAgentOutputs(chatId);
  if (
    agentOutputs?.paused ||
    (freshChat &&
      isPaused({
        handledBy: freshChat.handledBy,
        hasOpenHandoff: await hasOpenHandoff({ chatId }),
      }))
  ) {
    console.log(`[Chat] Discarding agent reply for ${chatId}: chat is paused`);
    return false;
  }

  const blocked = agentOutputs?.blocked === true;

  await saveMessages({
    messages: [
      {
        ...reply,
        // Text after the handoff message isn't kept: David is paused.
        parts: agentOutputs?.handoff
          ? trimAfterHandoff(reply.parts as { type: string }[])
          : reply.parts,
        createdAt: new Date(),
        attachments: [],
        chatId,
        blocked,
        senderType: 'ai_agent',
        senderId: null,
      },
    ],
  });

  if (usage) {
    try {
      await updateChatLastContextById({ chatId, context: toV3Usage(usage) });
    } catch (err) {
      console.warn('Unable to persist last usage for chat', chatId, err);
    }
  }

  if (agentOutputs) {
    try {
      // A blocked turn stays visible but is never sent to the agent again.
      if (blocked && customerMessageId) {
        await markMessagesBlocked({ ids: [customerMessageId] });
      }
      await updateChatAgentState({
        chatId,
        // useCase segments the conversation: a turn without a case (a
        // "gracias" after a balance question) keeps the last one.
        useCase: agentOutputs.useCase ?? undefined,
        intent: agentOutputs.intent,
        language: agentOutputs.language,
        handledBy: agentOutputs.handoff ? 'human_queue' : undefined,
      });
      if (agentOutputs.handoff) {
        await openHandoff({ chatId, ...agentOutputs.handoff });
        await cancelAgentTurns({ chatId });
      }
      // The agent said goodbye ("no gracias, eso es todo"): resolved.
      // A new customer message reopens it.
      if (agentOutputs.intent === 'GOODBYE' && !agentOutputs.handoff) {
        await resolveChatByAgent({ chatId });
      }
    } catch (err) {
      console.warn('Unable to persist agent state for chat', chatId, err);
    }
  }
  return true;
}
