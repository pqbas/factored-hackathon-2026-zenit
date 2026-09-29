import postgres from 'postgres';
import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import { openHandoff } from '@chat-template/db';
import { skipInEphemeralMode } from '../helpers';

async function postChatMessage(
  userContext: { request: { post: Function } },
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

const EXPECTED_HANDOFF = {
  reason: 'complaint',
  summary: 'Reclamo por un cargo no reconocido.',
  verifiedData: {
    card_last4: '4930',
    merchant: 'Internet Plus',
    amount: 329.44,
    currency: 'USD',
  },
};

test.describe('Agent handoff in the console (with database)', () => {
  skipInEphemeralMode(test);

  test('a handoff turn is stored and shown on every console view, not to the customer', async ({
    adaContext,
    babbageContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(
      adaContext,
      chatId,
      '[agent-outputs:complaint] no reconozco un cargo',
    );

    const detail = async () =>
      (
        await babbageContext.request.get(`/api/advisor/conversations/${chatId}`)
      ).json();
    await expect.poll(async () => (await detail()).hasHandoff).toBe(true);
    const chat = await detail();
    expect(chat.handledBy).toBe('human_queue');
    expect(chat.handoff).toMatchObject({
      ...EXPECTED_HANDOFF,
      resolvedAt: null,
    });
    expect(chat.handoff.facts.tools_called).toEqual(['list_transactions']);
    expect(typeof chat.handoff.at).toBe('string');

    const { chats } = await (
      await babbageContext.request.get(
        `/api/advisor/conversations?userId=${adaContext.name}-id&limit=100`,
      )
    ).json();
    const row = chats.find((c: any) => c.id === chatId);
    expect(row.hasHandoff).toBe(true);
    expect(row.handoff.reason).toBe('complaint');

    const own = await (
      await adaContext.request.get(`/api/chat/${chatId}`)
    ).json();
    expect(own).not.toHaveProperty('handoff');
    expect(own).not.toHaveProperty('hasHandoff');
  });

  test('handing the chat back closes the handoff, which stays visible', async ({
    adaContext,
    babbageContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(
      adaContext,
      chatId,
      '[agent-outputs:complaint] no reconozco un cargo',
    );
    await expect
      .poll(
        async () =>
          (
            await (
              await babbageContext.request.get(
                `/api/advisor/conversations/${chatId}`,
              )
            ).json()
          ).hasHandoff,
      )
      .toBe(true);

    const take = await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/take`,
      { data: {} },
    );
    expect((await take.json()).chat.hasHandoff).toBe(true);

    const release = await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/release`,
      { data: { outcome: 'returned_to_agent' } },
    );
    const released = (await release.json()).chat;
    expect(released.hasHandoff).toBe(false);
    expect(released.handoff).toMatchObject(EXPECTED_HANDOFF);
    expect(typeof released.handoff.resolvedAt).toBe('string');

    const { chats } = await (
      await babbageContext.request.get(
        `/api/advisor/customers/${encodeURIComponent(`${adaContext.name}@example.com`)}/conversations`,
      )
    ).json();
    const inTimeline = chats.find((c: any) => c.id === chatId);
    expect(inTimeline.handoff.reason).toBe('complaint');
    expect(inTimeline.hasHandoff).toBe(false);
  });

  test('a second handoff while one is open is not duplicated', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(adaContext, chatId, 'hola');
    for (const reason of ['complaint', 'retention']) {
      await openHandoff({ chatId, reason, summary: null, facts: null });
    }

    const db = postgres(process.env.POSTGRES_URL as string, { max: 1 });
    try {
      const rows = await db`
        select reason from ai_chatbot."Handoff" where "chatId" = ${chatId}
      `;
      expect(rows.map((r) => r.reason)).toEqual(['complaint']);
    } finally {
      await db.end();
    }
  });
});
