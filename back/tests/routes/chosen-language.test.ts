import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import { getAgentTurns } from '@chat-template/db';
import { skipInEphemeralMode } from '../helpers';
import type { CapturedRequest } from '../api-mocking/api-mock-handlers';

type UserContext = { request: { post: Function; get: Function } };

async function send(
  userContext: UserContext,
  chatId: string,
  text: string,
  language?: string,
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
      ...(language === undefined ? {} : { language }),
    },
  });
  await response.text();
  return response.status();
}

async function agentRequests(userContext: UserContext, chatId: string) {
  const all = (await (
    await userContext.request.get('/api/test/captured-requests')
  ).json()) as CapturedRequest[];
  return all.filter((r) => r.context?.conversation_id === chatId);
}

test.describe("The customer's chosen language reaches the agent", () => {
  test('es and pt travel as custom_inputs.language', async ({ adaContext }) => {
    for (const language of ['es', 'pt']) {
      const chatId = generateUUID();
      expect(await send(adaContext, chatId, 'oi', language)).toBe(200);
      const [request] = await agentRequests(adaContext, chatId);
      expect(request?.customInputs?.language, language).toBe(language);
    }
  });

  test('a missing or unknown language is not sent, and is not an error', async ({
    adaContext,
  }) => {
    for (const language of [undefined, 'en', 'PT', '']) {
      const chatId = generateUUID();
      expect(await send(adaContext, chatId, 'hola', language)).toBe(200);
      const [request] = await agentRequests(adaContext, chatId);
      expect(request?.customInputs, String(language)).toEqual({
        handled_by: 'ai_agent',
      });
    }
  });
});

test.describe('The chosen language on a queued turn (with database)', () => {
  skipInEphemeralMode(test);

  test('the worker retries a queued turn with its language', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await send(adaContext, chatId, `[agent-down-1:${generateUUID()}] oi`, 'pt');
    await expect
      .poll(async () => (await getAgentTurns({ chatId })).map((t) => t.status))
      .toEqual(['done']);
    const requests = await agentRequests(adaContext, chatId);
    expect(requests.map((r) => r.customInputs?.language)).toEqual(['pt', 'pt']);
  });
});
