import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import {
  getAgentTurns,
  getChatById,
  getMessagesByChatId,
  hasOpenHandoff,
  openHandoff,
} from '@chat-template/db';
import { skipInEphemeralMode } from '../helpers';
import type { CapturedRequest } from '../api-mocking/api-mock-handlers';

type UserContext = { request: { post: Function; get: Function } };

const HANDOFF_TEXT =
  'Te comunico con un asesor, que ya tiene los datos de tu caso.';

function postChatMessage(
  userContext: UserContext,
  chatId: string,
  text: string,
) {
  return userContext.request.post('/api/chat', {
    data: {
      id: chatId,
      message: {
        id: generateUUID(),
        createdAt: new Date().toISOString(),
        role: 'user',
        content: text,
        parts: [{ type: 'text', text }],
      },
      selectedChatModel: 'chat-model',
      selectedVisibilityType: 'private',
    },
  });
}

async function sendMessage(
  userContext: UserContext,
  chatId: string,
  text: string,
) {
  const response = await postChatMessage(userContext, chatId, text);
  return { status: response.status(), body: (await response.text()) as string };
}

const turnStatus = async (chatId: string) =>
  (await getAgentTurns({ chatId })).map((t) => t.status);

const roles = async (chatId: string) =>
  (await getMessagesByChatId({ id: chatId })).map((m) => m.role);

async function agentRequests(userContext: UserContext, chatId: string) {
  const all = (await (
    await userContext.request.get('/api/test/captured-requests')
  ).json()) as CapturedRequest[];
  return all.filter((r) => r.context?.conversation_id === chatId);
}

test.describe('David pauses after a handoff (with database)', () => {
  skipInEphemeralMode(test);

  test('a handoff turn cancels the turns queued behind it', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    // Queued (the agent is down once), then answered slowly by the worker
    // with a handoff.
    await sendMessage(
      adaContext,
      chatId,
      `[agent-down-1:${generateUUID()}][agent-slow:1500][agent-outputs:complaint] no reconozco un cargo`,
    );
    await expect.poll(() => turnStatus(chatId)).toEqual(['pending']);

    // The worker answers the latest message, so both carry the markers.
    const second = await sendMessage(
      adaContext,
      chatId,
      '[agent-slow:1500][agent-outputs:complaint] sigo esperando',
    );
    expect(second.body).toContain('"type":"data-agent-pending"');
    expect(await turnStatus(chatId)).toEqual(['pending', 'pending']);

    await expect.poll(() => turnStatus(chatId)).toEqual(['done', 'discarded']);
    expect(await roles(chatId)).toEqual(['user', 'user', 'assistant']);
    expect((await getChatById({ id: chatId }))?.handledBy).toBe('human_queue');
  });

  test('a message sent while David is still answering is queued and dropped if that turn hands off', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    const first = postChatMessage(
      adaContext,
      chatId,
      '[agent-slow:2000][agent-outputs:complaint] no reconozco un cargo',
    );
    await new Promise((r) => setTimeout(r, 700));

    const second = await sendMessage(adaContext, chatId, 'hola?');
    expect(second.status).toBe(200);
    expect(second.body).toContain('"type":"start"');
    expect(second.body).toContain('"type":"data-agent-pending"');
    expect(second.body).toContain('"type":"finish"');
    expect(await turnStatus(chatId)).toEqual(['pending']);

    expect((await first).status()).toBe(200);
    await (await first).text();
    await expect.poll(() => turnStatus(chatId)).toEqual(['discarded']);

    expect(await roles(chatId)).toEqual(['user', 'user', 'assistant']);
    // The agent was called once: the queued message never reached it.
    expect(await agentRequests(adaContext, chatId)).toHaveLength(1);
  });

  test('taking the chat cancels its pending turns right away', async ({
    adaContext,
    babbageContext,
  }) => {
    const chatId = generateUUID();
    await sendMessage(
      adaContext,
      chatId,
      `[agent-down-1000:${generateUUID()}] hola`,
    );
    await expect.poll(() => turnStatus(chatId)).toEqual(['pending']);

    await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/take`,
      { data: {} },
    );

    expect(await turnStatus(chatId)).toEqual(['discarded']);
  });

  test('an open handoff pauses the chat even if the agent still owns it', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await sendMessage(adaContext, chatId, 'hola');
    const before = (await agentRequests(adaContext, chatId)).length;
    expect(before).toBe(1);

    await openHandoff({
      chatId,
      reason: 'complaint',
      summary: null,
      facts: null,
    });
    expect((await getChatById({ id: chatId }))?.handledBy).toBe('ai_agent');

    const { body } = await sendMessage(adaContext, chatId, 'sigo aquí');
    expect(body).toContain('"type":"data-conversation-state"');
    expect(await agentRequests(adaContext, chatId)).toHaveLength(before);
    expect(await roles(chatId)).toEqual(['user', 'assistant', 'user']);
  });

  test('an agent reply flagged paused saves no message and applies no outputs', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    const { status, body } = await sendMessage(
      adaContext,
      chatId,
      '[agent-outputs:paused] hola',
    );

    // The customer sees nothing: no text and no error message.
    expect(status).toBe(200);
    expect(body).not.toContain('"type":"text-delta"');
    expect(body).not.toContain('"type":"data-error"');
    expect(body).not.toContain('"type":"error"');
    expect(await roles(chatId)).toEqual(['user']);
    const chat = await getChatById({ id: chatId });
    expect(chat?.useCase).toBeNull();
    expect(chat?.intent).toBeNull();
  });

  test('a queued turn answered with paused is discarded, not done', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await sendMessage(
      adaContext,
      chatId,
      `[agent-down-1:${generateUUID()}][agent-outputs:paused] hola`,
    );

    await expect.poll(() => turnStatus(chatId)).toEqual(['discarded']);
    expect(await roles(chatId)).toEqual(['user']);
  });

  test('every agent call carries custom_inputs.handled_by', async ({
    adaContext,
  }) => {
    const liveChat = generateUUID();
    await sendMessage(adaContext, liveChat, 'hola');
    const live = await agentRequests(adaContext, liveChat);
    expect(live.map((r) => r.customInputs?.handled_by)).toEqual(['ai_agent']);

    // The failed live call and the worker's retry.
    const queuedChat = generateUUID();
    await sendMessage(
      adaContext,
      queuedChat,
      `[agent-down-1:${generateUUID()}] hola`,
    );
    await expect.poll(() => turnStatus(queuedChat)).toEqual(['done']);
    const queued = await agentRequests(adaContext, queuedChat);
    expect(queued).toHaveLength(2);
    expect(queued.map((r) => r.customInputs?.handled_by)).toEqual([
      'ai_agent',
      'ai_agent',
    ]);
  });

  test('text after the handoff message is not kept', async ({ adaContext }) => {
    const chatId = generateUUID();
    await sendMessage(
      adaContext,
      chatId,
      '[agent-outputs:complaintThenText] no reconozco un cargo',
    );

    const saved = (await getMessagesByChatId({ id: chatId })).find(
      (m) => m.role === 'assistant',
    );
    const texts = (saved?.parts as Array<{ type: string; text: string }>)
      .filter((p) => p.type === 'text')
      .map((p) => p.text);
    expect(texts.at(-1)).toBe(HANDOFF_TEXT);
    expect(texts.join(' ')).not.toContain('Mientras tanto');
  });

  test('handing the chat back closes the handoff and David answers again', async ({
    adaContext,
    babbageContext,
  }) => {
    const chatId = generateUUID();
    await sendMessage(
      adaContext,
      chatId,
      '[agent-outputs:complaint] no reconozco un cargo',
    );
    expect(await hasOpenHandoff({ chatId })).toBe(true);

    await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/take`,
      { data: {} },
    );
    await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/release`,
      { data: { outcome: 'returned_to_agent' } },
    );
    expect(await hasOpenHandoff({ chatId })).toBe(false);
    expect((await getChatById({ id: chatId }))?.handledBy).toBe('ai_agent');

    const before = (await agentRequests(adaContext, chatId)).length;
    await sendMessage(adaContext, chatId, 'gracias, una duda más');

    expect(await agentRequests(adaContext, chatId)).toHaveLength(before + 1);
    const senders = (await getMessagesByChatId({ id: chatId })).map(
      (m) => m.senderType,
    );
    expect(senders.at(-1)).toBe('ai_agent');
  });
});
