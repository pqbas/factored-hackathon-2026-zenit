import {
  claimAgentTurns,
  deferAgentTurn,
  finishAgentTurn,
  getChatById,
  getMessagesByChatId,
  hasOpenHandoff,
  openHandoff,
  retryAgentTurnLater,
  saveMessages,
  updateChatAgentState,
  type AgentTurn,
} from '@chat-template/db';
import { convertToUIMessages, generateUUID } from '@chat-template/core';
import { persistAgentReply, streamAgentTurn, streamCache } from './agent-reply';
import { isPaused } from './agent-turn';

// Customer turns the agent couldn't take (its App was redeploying) wait in
// AgentTurn; this worker answers them once the agent is back. Postgres is the
// queue: claims use FOR UPDATE SKIP LOCKED plus a lease, oldest turn per chat
// first. A turn is discarded when someone already answered after it or an
// advisor took the chat, and expires after MAX_AGE_MS: then the chat goes to
// the human queue with a notice, the only message the queue ever saves, and
// an open agent_unavailable handoff so it stays paused like any handoff.
const INTERVAL_MS = Number(process.env.AGENT_QUEUE_INTERVAL_MS) || 5000;
const BACKOFF_MS = Number(process.env.AGENT_QUEUE_BACKOFF_MS) || 5000;
const MAX_BACKOFF_MS = 60_000;
const MAX_AGE_MS = Number(process.env.AGENT_QUEUE_MAX_AGE_MS) || 20 * 60_000;
const LEASE_MS = 2 * 60_000;

export const EXPIRED_NOTICE =
  'David no pudo responder. Un asesor te va a atender.';

async function expire(turn: AgentTurn) {
  await saveMessages({
    messages: [
      {
        id: generateUUID(),
        chatId: turn.chatId,
        role: 'system',
        parts: [{ type: 'text', text: EXPIRED_NOTICE }],
        attachments: [],
        createdAt: new Date(),
        blocked: false,
        senderType: 'system',
        senderId: null,
      },
    ],
  });
  await updateChatAgentState({ chatId: turn.chatId, handledBy: 'human_queue' });
  await openHandoff({
    chatId: turn.chatId,
    reason: 'agent_unavailable',
    summary: null,
    facts: null,
  });
  await finishAgentTurn({ id: turn.id, status: 'expired' });
}

// Runs the agent to completion and returns its text; a stream error (the
// agent still down) throws.
async function askAgent(
  turn: AgentTurn,
  handledBy: string,
  messages: ReturnType<typeof convertToUIMessages>,
) {
  const result = await streamAgentTurn({
    chatId: turn.chatId,
    userId: turn.userId,
    sessionToken: turn.sessionToken,
    handledBy,
    messages,
  });
  let text = '';
  for await (const part of result.fullStream) {
    if (part.type === 'error') throw part.error;
    if (part.type === 'text-delta') text += part.text;
  }
  return text;
}

export async function processAgentTurn(turn: AgentTurn) {
  const chat = await getChatById({ id: turn.chatId });
  if (
    !chat ||
    isPaused({
      handledBy: chat.handledBy,
      hasOpenHandoff: await hasOpenHandoff({ chatId: turn.chatId }),
    })
  ) {
    await finishAgentTurn({ id: turn.id, status: 'discarded' });
    return;
  }

  // David is still answering an earlier message of this chat: one turn at a
  // time, and that one may end in a handoff that cancels this turn.
  if (streamCache.getActiveStreamId(turn.chatId)) {
    await deferAgentTurn({ id: turn.id, delayMs: BACKOFF_MS });
    return;
  }

  const messages = await getMessagesByChatId({ id: turn.chatId });
  const customerMessage = messages.find((m) => m.id === turn.messageId);
  const answered =
    !customerMessage ||
    messages.some(
      (m) => m.role === 'assistant' && m.createdAt > customerMessage.createdAt,
    );
  if (answered) {
    await finishAgentTurn({ id: turn.id, status: 'discarded' });
    return;
  }

  if (Date.now() - turn.createdAt.getTime() > MAX_AGE_MS) {
    await expire(turn);
    return;
  }

  try {
    const text = await askAgent(
      turn,
      chat.handledBy,
      convertToUIMessages(messages),
    );
    const saved = await persistAgentReply({
      chatId: turn.chatId,
      customerMessageId: turn.messageId,
      reply: {
        id: generateUUID(),
        role: 'assistant',
        parts: [{ type: 'text', text }],
      },
      startedAt: turn.createdAt,
      source: 'queue',
    });
    await finishAgentTurn({
      id: turn.id,
      status: saved ? 'done' : 'discarded',
    });
  } catch (error) {
    const delayMs = Math.min(BACKOFF_MS * 2 ** turn.attempts, MAX_BACKOFF_MS);
    console.warn(
      `[agent-queue] Turn ${turn.id} failed (attempt ${turn.attempts + 1}), retrying in ${delayMs} ms:`,
      error instanceof Error ? error.message : error,
    );
    await retryAgentTurnLater({ id: turn.id, delayMs });
  }
}

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const turns = await claimAgentTurns({ limit: 5, leaseMs: LEASE_MS });
    for (const turn of turns) await processAgentTurn(turn);
  } catch (error) {
    console.warn('[agent-queue] Tick failed:', error);
  } finally {
    running = false;
  }
}

export function startAgentQueueWorker() {
  const timer = setInterval(tick, INTERVAL_MS);
  timer.unref();
  console.log(`[agent-queue] Worker started (every ${INTERVAL_MS} ms)`);
}
