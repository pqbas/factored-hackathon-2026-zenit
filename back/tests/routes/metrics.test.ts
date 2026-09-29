import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import postgres from 'postgres';
import { getChatById, saveChat, updateChatAgentState } from '@chat-template/db';
import { skipInEphemeralMode, skipInWithDatabaseMode } from '../helpers';

function textMessage(text: string) {
  return {
    id: generateUUID(),
    createdAt: new Date().toISOString(),
    role: 'user' as const,
    content: text,
    parts: [{ type: 'text', text }],
  };
}

async function postChatMessage(
  userContext: { request: { post: Function } },
  chatId: string,
  text: string,
) {
  const response = await userContext.request.post('/api/chat', {
    data: {
      id: chatId,
      message: textMessage(text),
      selectedChatModel: 'chat-model',
      selectedVisibilityType: 'private',
    },
  });
  await response.text();
}

// Other workers log resolution events in parallel, so each test reads only the
// byUseCase entry of a use case unique to it.
async function chatWithUseCase(
  customer: { request: { post: Function } },
  useCase: string,
) {
  const chatId = generateUUID();
  await postChatMessage(customer, chatId, 'hola');
  await updateChatAgentState({ chatId, useCase });
  return chatId;
}

async function sayGoodbye(
  customer: { request: { post: Function } },
  chatId: string,
) {
  await postChatMessage(
    customer,
    chatId,
    '[agent-outputs:goodbye] no gracias, eso es todo',
  );
  await expect
    .poll(async () => (await getChatById({ id: chatId }))?.closedAt)
    .not.toBeNull();
}

async function metricsFor(
  admin: { request: { get: Function } },
  useCase: string,
  query = '',
) {
  const response = await admin.request.get(`/api/advisor/metrics${query}`);
  expect(response.status()).toBe(200);
  const body = await response.json();
  return { body, row: body.byUseCase[useCase] };
}

test.describe('/api/advisor/metrics (with database)', () => {
  skipInEphemeralMode(test);

  test('a goodbye with David handling it counts as contained by the AI', async ({
    adaContext,
  }) => {
    const useCase = `M_AI_${generateUUID()}`;
    const chatId = await chatWithUseCase(adaContext, useCase);
    await sayGoodbye(adaContext, chatId);

    const { body, row } = await metricsFor(adaContext, useCase);
    expect(row).toEqual({ total: 1, aiContained: 1, human: 0, assisted: 0 });
    expect(body.total).toBeGreaterThanOrEqual(1);
    const today = new Date().toISOString().slice(0, 10);
    expect(body.byDay.some((d: { day: string }) => d.day === today)).toBe(
      true,
    );
  });

  test('an advisor resolving counts as human; a take then goodbye counts as assisted', async ({
    adaContext,
    babbageContext,
  }) => {
    const useCase = `M_HUMAN_${generateUUID()}`;

    const resolvedByAdvisor = await chatWithUseCase(adaContext, useCase);
    await babbageContext.request.post(
      `/api/advisor/conversations/${resolvedByAdvisor}/take`,
      { data: {} },
    );
    await babbageContext.request.post(
      `/api/advisor/conversations/${resolvedByAdvisor}/release`,
      { data: { outcome: 'resolved' } },
    );

    const assisted = await chatWithUseCase(adaContext, useCase);
    await babbageContext.request.post(
      `/api/advisor/conversations/${assisted}/take`,
      { data: {} },
    );
    await babbageContext.request.post(
      `/api/advisor/conversations/${assisted}/release`,
      { data: { outcome: 'returned_to_agent' } },
    );
    await sayGoodbye(adaContext, assisted);

    const { row } = await metricsFor(adaContext, useCase);
    expect(row).toEqual({ total: 2, aiContained: 0, human: 1, assisted: 1 });
  });

  test('reopening resets hadHuman: each close is its own event', async ({
    adaContext,
    babbageContext,
  }) => {
    const useCase = `M_REOPEN_${generateUUID()}`;
    const chatId = await chatWithUseCase(adaContext, useCase);
    await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/take`,
      { data: {} },
    );
    await babbageContext.request.post(
      `/api/advisor/conversations/${chatId}/release`,
      { data: { outcome: 'resolved' } },
    );

    // The customer writes again: the chat reopens with David and no human.
    await postChatMessage(adaContext, chatId, 'una cosa más');
    expect((await getChatById({ id: chatId }))?.hadHuman).toBe(false);
    await sayGoodbye(adaContext, chatId);

    const { row } = await metricsFor(adaContext, useCase);
    expect(row).toEqual({ total: 2, aiContained: 1, human: 1, assisted: 0 });
  });

  test('a handoff marks the chat as having had a human', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(
      adaContext,
      chatId,
      '[agent-outputs:handoff] quiero hablar con un asesor',
    );
    await expect
      .poll(async () => (await getChatById({ id: chatId }))?.hadHuman)
      .toBe(true);
  });

  test('from/to filter by day, inclusive', async ({ adaContext }) => {
    const useCase = `M_RANGE_${generateUUID()}`;
    const chatId = await chatWithUseCase(adaContext, useCase);
    await sayGoodbye(adaContext, chatId);

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000)
      .toISOString()
      .slice(0, 10);

    expect(
      (await metricsFor(adaContext, useCase, `?from=${today}&to=${today}`))
        .row?.total,
    ).toBe(1);
    expect(
      (await metricsFor(adaContext, useCase, `?from=${tomorrow}`)).row,
    ).toBeUndefined();
  });

  test('tz makes from/to and byDay local days', async ({ adaContext }) => {
    // 22:30 on 2026-01-10 in Lima (UTC-5) is 03:30 on 2026-01-11 in UTC.
    const useCase = `M_TZ_${generateUUID()}`;
    const chatId = generateUUID();
    await saveChat({
      id: chatId,
      userId: `${adaContext.name}-id`,
      title: 'Metrics tz',
      visibility: 'private',
    });
    const db = postgres(process.env.POSTGRES_URL as string, { max: 1 });
    try {
      await db`
        insert into ai_chatbot."ResolutionEvent"
          ("chatId", "resolvedBy", "hadHuman", "useCase", "resolvedAt")
        values (${chatId}, 'ai', false, ${useCase}, '2026-01-11 03:30:00')
      `;
    } finally {
      await db.end();
    }

    const lima = await metricsFor(
      adaContext,
      useCase,
      '?from=2026-01-10&to=2026-01-10&tz=America/Lima',
    );
    expect(lima.row?.total).toBe(1);
    expect(
      lima.body.byDay.find((d: { day: string }) => d.day === '2026-01-10')
        ?.total,
    ).toBeGreaterThanOrEqual(1);
    expect(
      (
        await metricsFor(
          adaContext,
          useCase,
          '?from=2026-01-11&to=2026-01-11&tz=America/Lima',
        )
      ).row,
    ).toBeUndefined();

    // Without tz, days are UTC, as before.
    expect(
      (await metricsFor(adaContext, useCase, '?from=2026-01-11&to=2026-01-11'))
        .row?.total,
    ).toBe(1);
  });

  test('bad dates get 400; advisors and customers get 403', async ({
    adaContext,
    babbageContext,
    curieContext,
  }) => {
    expect(
      (await adaContext.request.get('/api/advisor/metrics?from=ayer')).status(),
    ).toBe(400);
    expect(
      (
        await adaContext.request.get('/api/advisor/metrics?tz=Mars/Olympus')
      ).status(),
    ).toBe(400);
    expect(
      (await babbageContext.request.get('/api/advisor/metrics')).status(),
    ).toBe(403);
    expect(
      (await curieContext.request.get('/api/advisor/metrics')).status(),
    ).toBe(403);
  });
});

test.describe('/api/advisor/metrics (ephemeral mode)', () => {
  skipInWithDatabaseMode(test);

  test('returns 204 without a database', async ({ adaContext }) => {
    expect((await adaContext.request.get('/api/advisor/metrics')).status()).toBe(
      204,
    );
  });
});
