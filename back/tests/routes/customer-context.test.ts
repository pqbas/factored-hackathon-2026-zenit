import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import {
  getChatById,
  getCustomerIdsWithoutName,
  saveChat,
} from '@chat-template/db';
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
          interactionId: 'INT-1',
          hasTranscript: true,
          date: '2026-04-23T06:01:09.000Z',
          interactionType: 'Inbound Call',
          channel: 'Phone',
          reason: 'Transaccional',
          resolved: true,
          escalated: false,
          sentiment: 'Neutral',
        },
        {
          interactionId: 'INT-2',
          hasTranscript: false,
          date: '2026-04-04T04:02:46.000Z',
          interactionType: 'Outbound Call',
          channel: 'Phone',
          reason: 'Transaccional',
          resolved: true,
          escalated: false,
          sentiment: 'Neutral',
        },
      ]);
      // Only the listed interactions' transcripts, linked by interactionId.
      expect(body.transcripts).toEqual([
        {
          interactionId: 'INT-1',
          date: '2026-04-22',
          customerText: 'Mi tarjeta es [NÚMERO OCULTO] y el [DATO OCULTO]',
          agentText: 'Gracias, ya lo reviso.',
          language: 'es',
          intents: 'consulta_general',
          topics: 'Queja',
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

  test('the console shows the bank customer name; customer routes do not', async ({
    adaContext,
    babbageContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(adaContext, chatId, 'demo-mx-1');
    await expect
      .poll(async () => (await getChatById({ id: chatId }))?.customerName)
      .toBe('Santiago Contreras López');

    const one = await babbageContext.request.get(
      `/api/advisor/conversations/${chatId}`,
    );
    expect(one.status()).toBe(200);
    expect((await one.json()).customerName).toBe('Santiago Contreras López');

    const { chats } = await (
      await babbageContext.request.get(
        `/api/advisor/conversations?userId=${adaContext.name}-id&limit=100&handledBy=ai_agent`,
      )
    ).json();
    expect(chats.find((c: any) => c.id === chatId)?.customerName).toBe(
      'Santiago Contreras López',
    );

    const own = await (await adaContext.request.get(`/api/chat/${chatId}`)).json();
    expect(own).not.toHaveProperty('customerName');
    const history = await (
      await adaContext.request.get('/api/history?limit=100')
    ).json();
    expect(
      history.chats.find((c: any) => c.id === chatId),
    ).not.toHaveProperty('customerName');
  });

  test('a chat whose name lookup is missing gets it on the next turn', async ({
    adaContext,
  }) => {
    // Stands for a failed lookup: customerId set, customerName still null.
    const chatId = generateUUID();
    await saveChat({
      id: chatId,
      userId: `${adaContext.name}-id`,
      title: 'Lookup pending',
      visibility: 'private',
      customerId: 'CLI-FLEUCGTWGAHL',
    });
    // The startup backfill picks up customers with a chat missing the name.
    const pendingCustomer = `CLI-TEST-${generateUUID()}`;
    await saveChat({
      id: generateUUID(),
      userId: `${adaContext.name}-id`,
      title: 'Backfill pending',
      visibility: 'private',
      customerId: pendingCustomer,
    });
    expect(await getCustomerIdsWithoutName()).toContain(pendingCustomer);

    await postChatMessage(adaContext, chatId, 'demo-mx-1');
    await expect
      .poll(async () => (await getChatById({ id: chatId }))?.customerName)
      .toBe('Santiago Contreras López');
  });

  test('GET /api/advisor/conversations/:id: 404 unknown, 403 customer', async ({
    babbageContext,
    curieContext,
  }) => {
    expect(
      (
        await babbageContext.request.get(
          `/api/advisor/conversations/${generateUUID()}`,
        )
      ).status(),
    ).toBe(404);
    expect(
      (
        await curieContext.request.get(
          `/api/advisor/conversations/${generateUUID()}`,
        )
      ).status(),
    ).toBe(403);
  });

  test('/api/history?sessionToken= lists only that demo customer, without its id', async ({
    adaContext,
  }) => {
    const santiago = generateUUID();
    await postChatMessage(adaContext, santiago, 'demo-mx-1');
    const javier = generateUUID();
    await postChatMessage(adaContext, javier, 'demo-co-1');

    const ids = async (query: string) => {
      const { chats } = await (
        await adaContext.request.get(`/api/history?limit=100${query}`)
      ).json();
      for (const c of chats) expect(c).not.toHaveProperty('customerId');
      return chats.map((c: any) => c.id);
    };

    const mx = await ids('&sessionToken=demo-mx-1');
    expect(mx).toContain(santiago);
    expect(mx).not.toContain(javier);

    const co = await ids('&sessionToken=demo-co-1');
    expect(co).toContain(javier);
    expect(co).not.toContain(santiago);

    const all = await ids('');
    expect(all).toEqual(expect.arrayContaining([santiago, javier]));

    expect(await ids('&sessionToken=demo-expired')).toEqual([]);
    expect(await ids('&sessionToken=no-existe')).toEqual([]);
  });
});
