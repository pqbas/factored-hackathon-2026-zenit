import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import { getChatById, saveChat } from '@chat-template/db';
import { skipInEphemeralMode } from '../helpers';

async function postChatMessage(
  userContext: { request: { post: Function } },
  chatId: string,
  sessionToken?: string,
) {
  const text = 'hola';
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
      ...(sessionToken ? { sessionToken } : {}),
    },
  });
  await response.text();
}

test.describe('Customer context in the console (with database)', () => {
  skipInEphemeralMode(test);

  test('the chat keeps the session customer, and follows a new session', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(adaContext, chatId, 'demo-mx-1');
    expect((await getChatById({ id: chatId }))?.customerId).toBe(
      'CLI-FLEUCGTWGAHL',
    );

    // A turn without a token keeps it; a turn with another customer's token
    // replaces it; an expired session doesn't count.
    await postChatMessage(adaContext, chatId);
    expect((await getChatById({ id: chatId }))?.customerId).toBe(
      'CLI-FLEUCGTWGAHL',
    );
    await postChatMessage(adaContext, chatId, 'demo-co-1');
    expect((await getChatById({ id: chatId }))?.customerId).toBe(
      'CLI-7MPS3ZOPSN4Q',
    );

    const expired = generateUUID();
    await postChatMessage(adaContext, expired, 'demo-expired');
    expect((await getChatById({ id: expired }))?.customerId).toBeNull();
  });

  test('advisor and admin read the context; transcripts come masked', async ({
    adaContext,
    babbageContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(adaContext, chatId, 'demo-mx-1');

    for (const context of [babbageContext, adaContext]) {
      const response = await context.request.get(
        `/api/advisor/conversations/${chatId}/customer-context`,
      );
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.customer).toEqual({
        customerId: 'CLI-FLEUCGTWGAHL',
        firstName: 'Santiago',
        lastName: 'Contreras López',
      });
      expect(body.interactions).toEqual([
        {
          date: '2026-04-23T06:01:09.000Z',
          channel: 'Phone',
          reason: 'Transaccional',
          resolved: true,
          escalated: false,
          sentiment: 'Neutral',
        },
      ]);
      expect(body.transcripts).toEqual([
        {
          date: '2026-04-22',
          customerText: 'Mi tarjeta es [NÚMERO OCULTO] y el [DATO OCULTO]',
          agentText: 'Gracias, ya lo reviso.',
        },
      ]);
      expect(body.cases).toEqual([
        {
          type: 'Reclamo',
          category: 'Cobro indebido',
          date: '2026-03-01T10:00:00.000Z',
          claimedAmount: 120.5,
          currency: 'USD',
          priority: 'Alta',
          status: 'Cerrado',
          resolution: 'Reembolso',
        },
      ]);
    }
  });

  test('204 without a customer, 404 for an unknown chat, 403 for a customer', async ({
    babbageContext,
    curieContext,
  }) => {
    const chatId = generateUUID();
    await saveChat({
      id: chatId,
      userId: `${babbageContext.name}-id`,
      title: 'No session',
      visibility: 'private',
    });
    expect(
      (
        await babbageContext.request.get(
          `/api/advisor/conversations/${chatId}/customer-context`,
        )
      ).status(),
    ).toBe(204);
    expect(
      (
        await babbageContext.request.get(
          `/api/advisor/conversations/${generateUUID()}/customer-context`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await curieContext.request.get(
          `/api/advisor/conversations/${chatId}/customer-context`,
        )
      ).status(),
    ).toBe(403);
  });
});
