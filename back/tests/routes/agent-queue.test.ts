import postgres from 'postgres';
import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import {
  getAgentTurns,
  getChatById,
  getLatestHandoffs,
  getMessagesByChatId,
} from '@chat-template/db';
import { skipInEphemeralMode } from '../helpers';

async function postChatMessage(
  userContext: { request: { post: Function } },
  chatId: string,
  text: string,
) {
  const messageId = generateUUID();
  const response = await userContext.request.post('/api/chat', {
    data: {
      id: chatId,
      message: {
        id: messageId,
        createdAt: new Date().toISOString(),
        role: 'user',
        content: text,
        parts: [{ type: 'text', text }],
      },
      selectedChatModel: 'chat-model',
      selectedVisibilityType: 'private',
    },
  });
  return { response, messageId, body: await response.text() };
}

const turnStatus = async (chatId: string) =>
  (await getAgentTurns({ chatId })).map((t) => t.status);

test.describe('Agent queue (with database)', () => {
  skipInEphemeralMode(test);

  test('an unavailable agent queues the turn; the worker answers once it is back', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    // The agent is down for the chat request and the worker's first try.
    const { response, messageId, body } = await postChatMessage(
      adaContext,
      chatId,
      `[agent-down-2:${generateUUID()}] hola`,
    );

    expect(response.status()).toBe(200);
    expect(body).toContain('"type":"data-agent-pending"');
    expect(body).toContain(`"messageId":"${messageId}"`);
    expect(body).toContain('"type":"finish"');
    expect(body).not.toContain('"type":"error"');
    expect(body).not.toContain('data-error');
    expect(body).not.toContain('Bad Gateway');

    const messages = await getMessagesByChatId({ id: chatId });
    expect(messages.map((m) => m.id)).toContain(messageId);

    await expect.poll(() => turnStatus(chatId)).toEqual(['done']);
    const saved = await getMessagesByChatId({ id: chatId });
    expect(saved.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(saved[1].senderType).toBe('ai_agent');

    const chat = await (
      await adaContext.request.get(`/api/chat/${chatId}`)
    ).json();
    expect(chat.agentPending).toBe(false);
  });

  test('the pending turn is discarded when an advisor takes the chat', async ({
    adaContext,
    babbageContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(
      adaContext,
      chatId,
      `[agent-down-1000:${generateUUID()}] hola`,
    );
    await expect
      .poll(
        async () =>
          (await (await adaContext.request.get(`/api/chat/${chatId}`)).json())
            .agentPending,
      )
      .toBe(true);

    await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/take`,
      { data: {} },
    );

    await expect.poll(() => turnStatus(chatId)).toEqual(['discarded']);
    const roles = (await getMessagesByChatId({ id: chatId })).map(
      (m) => m.role,
    );
    expect(roles).not.toContain('assistant');
  });

  test('a turn past its max age expires: one notice, and the chat waits for an advisor', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(
      adaContext,
      chatId,
      `[agent-down-1000:${generateUUID()}] hola`,
    );
    await expect.poll(() => turnStatus(chatId)).toEqual(['pending']);

    const db = postgres(process.env.POSTGRES_URL as string, { max: 1 });
    try {
      await db`
        update ai_chatbot."AgentTurn"
        set "createdAt" = now() - interval '30 minutes'
        where "chatId" = ${chatId}
      `;
    } finally {
      await db.end();
    }

    await expect.poll(() => turnStatus(chatId)).toEqual(['expired']);
    const messages = await getMessagesByChatId({ id: chatId });
    expect(messages.map((m) => m.role)).toEqual(['user', 'system']);
    expect((messages[1].parts as Array<{ text: string }>)[0].text).toBe(
      'David no pudo responder. Un asesor te va a atender.',
    );
    expect((await getChatById({ id: chatId }))?.handledBy).toBe('human_queue');

    const [handoff] = await getLatestHandoffs({ chatIds: [chatId] });
    expect(handoff.reason).toBe('agent_unavailable');
    expect(handoff.resolvedAt).toBeNull();
  });
});
