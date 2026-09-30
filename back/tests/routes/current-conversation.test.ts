import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import { getAgentTurns } from '@chat-template/db';
import { skipInEphemeralMode } from '../helpers';
import type { CapturedRequest } from '../api-mocking/api-mock-handlers';

type UserContext = { request: { post: Function; get: Function } };

async function sendMessage(
  userContext: UserContext,
  chatId: string,
  text: string,
) {
  const response = await userContext.request.post('/api/chat', {
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
  await response.text();
}

async function agentRequests(userContext: UserContext, chatId: string) {
  const all = (await (
    await userContext.request.get('/api/test/captured-requests')
  ).json()) as CapturedRequest[];
  return all.filter((r) => r.context?.conversation_id === chatId);
}

// The texts of the input items of the chat's last request to the agent.
async function lastInput(userContext: UserContext, chatId: string) {
  const requests = await agentRequests(userContext, chatId);
  const input = (requests.at(-1)?.input ?? []) as Array<{
    content?: Array<{ text?: string }> | string;
  }>;
  return input.map((item) =>
    typeof item.content === 'string'
      ? item.content
      : (item.content ?? []).map((c) => c.text ?? '').join(''),
  );
}

test.describe('The agent gets only the current conversation (with database)', () => {
  skipInEphemeralMode(test);

  test('a chat that never closed sends every message', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await sendMessage(adaContext, chatId, 'hola');
    await sendMessage(adaContext, chatId, 'segunda pregunta');

    const input = await lastInput(adaContext, chatId);
    expect(input[0]).toBe('hola');
    expect(input.at(-1)).toBe('segunda pregunta');
    expect(input.length).toBeGreaterThan(2);
  });

  test('after a goodbye, the next message goes without the closed conversation', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await sendMessage(adaContext, chatId, 'primera consulta');
    await sendMessage(
      adaContext,
      chatId,
      '[agent-outputs:goodbye] eso es todo',
    );
    await sendMessage(adaContext, chatId, 'nueva consulta');

    expect(await lastInput(adaContext, chatId)).toEqual(['nueva consulta']);
  });

  test('after an advisor resolves and the customer writes again, only what follows goes', async ({
    adaContext,
    babbageContext,
  }) => {
    const chatId = generateUUID();
    await sendMessage(adaContext, chatId, '[agent-outputs:complaint] un cargo');
    await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/take`,
      { data: {} },
    );
    await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/messages`,
      { data: { text: 'Ya lo revisé.' } },
    );
    await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/release`,
      { data: { outcome: 'resolved' } },
    );
    await sendMessage(adaContext, chatId, 'hola de nuevo');

    expect(await lastInput(adaContext, chatId)).toEqual(['hola de nuevo']);
  });

  test('a chat handed back to David without closing sends everything, with [Asesor]', async ({
    adaContext,
    babbageContext,
  }) => {
    const chatId = generateUUID();
    await sendMessage(adaContext, chatId, '[agent-outputs:complaint] un cargo');
    await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/take`,
      { data: {} },
    );
    await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/messages`,
      { data: { text: 'Te devuelvo con David.' } },
    );
    await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/release`,
      { data: { outcome: 'returned_to_agent' } },
    );
    await sendMessage(adaContext, chatId, 'otra duda');

    const input = await lastInput(adaContext, chatId);
    expect(input[0]).toBe('[agent-outputs:complaint] un cargo');
    expect(input).toContain('[Asesor] Te devuelvo con David.');
    expect(input.at(-1)).toBe('otra duda');
  });

  test('a queued turn after a close goes cut the same way', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await sendMessage(adaContext, chatId, 'primera consulta');
    await sendMessage(adaContext, chatId, '[agent-outputs:goodbye] listo');
    const queued = `[agent-down-1:${generateUUID()}] después`;
    await sendMessage(adaContext, chatId, queued);

    await expect
      .poll(async () => (await getAgentTurns({ chatId })).map((t) => t.status))
      .toEqual(['done']);
    expect(await lastInput(adaContext, chatId)).toEqual([queued]);
  });
});
