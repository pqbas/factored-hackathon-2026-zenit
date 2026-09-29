import postgres from 'postgres';
import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import { getTurnMetrics } from '@chat-template/db';
import { skipInEphemeralMode } from '../helpers';
import { estimateCostUsd } from '../../server/src/pricing';

type UserContext = { request: { post: Function; get: Function } };

async function postChatMessage(
  userContext: UserContext,
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
  await response.text();
  return messageId;
}

const rowsOf = (chatId: string) => getTurnMetrics({ chatId });

test.describe('TurnMetric (with database)', () => {
  skipInEphemeralMode(test);

  test('a live turn leaves a live row with duration, intent and the agent usage', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    const messageId = await postChatMessage(
      adaContext,
      chatId,
      '[agent-outputs:usage] cuánto debo?',
    );

    await expect.poll(async () => (await rowsOf(chatId)).length).toBe(1);
    const [row] = await rowsOf(chatId);
    expect(row.source).toBe('live');
    expect(row.messageId).toBe(messageId);
    expect(row.durationMs).toBeGreaterThan(0);
    expect(row.intent).toBe('GENERAL_INQUIRY');
    expect(row.useCase).toBe('GENERAL_INQUIRY');
    expect(row.language).toBe('es');
    expect(row.blocked).toBe(false);
    expect(row.handoffReason).toBeNull();
    expect(row.inputTokens).toBe(1200);
    expect(row.outputTokens).toBe(300);
    expect(row.model).toBe('mock-model');
    expect(row.promptVersion).toBe('mock-prompt-v1');
    expect(row.classifier).toBe('llm');
  });

  test('a handoff turn records the handoff reason', async ({ adaContext }) => {
    const chatId = generateUUID();
    await postChatMessage(
      adaContext,
      chatId,
      '[agent-outputs:complaint] no reconozco un cargo',
    );

    await expect.poll(async () => (await rowsOf(chatId)).length).toBe(1);
    expect((await rowsOf(chatId))[0].handoffReason).toBe('complaint');
  });

  test('a queued turn answered by the worker leaves a queue row', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(
      adaContext,
      chatId,
      `[agent-down-1:${generateUUID()}][agent-outputs:usage] hola`,
    );

    await expect.poll(async () => (await rowsOf(chatId)).length).toBe(1);
    const [row] = await rowsOf(chatId);
    expect(row.source).toBe('queue');
    expect(row.inputTokens).toBe(1200);
  });

  test('a turn discarded because the chat is paused leaves no row', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(adaContext, chatId, '[agent-outputs:paused] hola');
    // Rows are written in order: once the next turn's row is there, the
    // discarded one would already be.
    const second = await postChatMessage(
      adaContext,
      chatId,
      '[agent-outputs:usage] y mi saldo?',
    );

    await expect.poll(async () => (await rowsOf(chatId)).length).toBe(1);
    expect((await rowsOf(chatId))[0].messageId).toBe(second);
  });

  test('without usage from the agent the tokens stay null', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(
      adaContext,
      chatId,
      '[agent-outputs:goodbye] no gracias, eso es todo',
    );

    await expect.poll(async () => (await rowsOf(chatId)).length).toBe(1);
    const [row] = await rowsOf(chatId);
    expect(row.inputTokens).toBeNull();
    expect(row.outputTokens).toBeNull();
    expect(row.model).toBeNull();
    expect(row.intent).toBe('GOODBYE');
  });

  test('/metrics: latency counts only live turns; cost is null without tokens', async ({
    adaContext,
  }) => {
    // Other workers write turns too: the rows of this test go on a day of
    // its own, far in the past, and the query reads only that day.
    const day = new Date(
      Date.UTC(1990, 0, 1 + Math.floor(Math.random() * 3000)),
    )
      .toISOString()
      .slice(0, 10);
    const chatId = generateUUID();
    await postChatMessage(adaContext, chatId, 'hola');

    const db = postgres(process.env.POSTGRES_URL as string, { max: 1 });
    try {
      const insert = (
        source: string,
        durationMs: number,
        tokens: [number, number] | null,
      ) => db`
        insert into ai_chatbot."TurnMetric"
          ("chatId", "source", "startedAt", "durationMs", "inputTokens", "outputTokens", "createdAt")
        values (${chatId}, ${source}, ${`${day} 12:00:00`}, ${durationMs},
          ${tokens?.[0] ?? null}, ${tokens?.[1] ?? null}, ${`${day} 12:00:00`})
      `;
      for (const ms of [100, 200, 300, 400, 500])
        await insert('live', ms, null);
      // A queue turn waits for the agent: it must not move the percentiles.
      await insert('queue', 999_999, null);

      const url = `/api/advisor/metrics?from=${day}&to=${day}&tz=UTC`;
      const noTokens = await (await adaContext.request.get(url)).json();
      expect(noTokens.latency).toEqual({ p50Ms: 300, p95Ms: 480, turns: 5 });
      expect(noTokens.cost.turnsWithUsage).toBe(0);
      expect(noTokens.cost.estimatedUsd).toBeNull();
      expect(noTokens.cost.perConversationUsd).toBeNull();
      expect(typeof noTokens.cost.assumptions).toBe('string');
      // The resolution fields are untouched.
      expect(noTokens.total).toBe(0);

      await insert('live', 1000, [2000, 500]);
      await insert('queue', 3000, [1000, 100]);
      const withTokens = await (await adaContext.request.get(url)).json();
      expect(withTokens.latency.turns).toBe(6);
      expect(withTokens.cost).toMatchObject({
        turnsWithUsage: 2,
        inputTokens: 3000,
        outputTokens: 600,
      });
      const expected = estimateCostUsd({
        inputTokens: 3000,
        outputTokens: 600,
        durationMs: 4000,
      }) as number;
      expect(withTokens.cost.estimatedUsd).toBeCloseTo(expected, 10);
      // One chat with turns in the range.
      expect(withTokens.cost.perConversationUsd).toBeCloseTo(expected, 10);
    } finally {
      await db.end();
    }
  });

  test('/conversations/:id/turns is 403 for an advisor and 200 for the admin', async ({
    adaContext,
    babbageContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(adaContext, chatId, '[agent-outputs:usage] hola');
    await expect.poll(async () => (await rowsOf(chatId)).length).toBe(1);

    expect(
      (
        await babbageContext.request.get(
          `/api/advisor/conversations/${chatId}/turns`,
        )
      ).status(),
    ).toBe(403);

    const response = await adaContext.request.get(
      `/api/advisor/conversations/${chatId}/turns`,
    );
    expect(response.status()).toBe(200);
    const { turns } = await response.json();
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ source: 'live', inputTokens: 1200 });

    expect(
      (
        await adaContext.request.get(
          `/api/advisor/conversations/${generateUUID()}/turns`,
        )
      ).status(),
    ).toBe(404);
  });
});
