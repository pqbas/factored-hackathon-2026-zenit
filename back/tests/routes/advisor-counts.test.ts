import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import { saveChat, updateChatAgentState } from '@chat-template/db';
import { skipInEphemeralMode, skipInWithDatabaseMode } from '../helpers';

// Every chat here belongs to a user id unique to the test, so counts filtered
// by ?userId= are not affected by chats other workers create in parallel.
async function createChatFor(userId: string) {
  const chatId = generateUUID();
  await saveChat({
    id: chatId,
    userId,
    userEmail: `${userId}@example.com`,
    title: 'Counts test chat',
    visibility: 'private',
  });
  return chatId;
}

test.describe('/api/advisor/conversations/counts (with database)', () => {
  skipInEphemeralMode(test);

  test("counts match each view, and mine counts only the caller's own chats", async ({
    babbageContext,
    adaContext,
  }) => {
    const userId = `counts-${generateUUID()}`;

    // David handles it: out of the human inbox, counted in aiAgent.
    const withDavid = await createChatFor(userId);
    await updateChatAgentState({ chatId: withDavid, useCase: 'CARD_BLOCK' });

    const queued = await createChatFor(userId);
    await updateChatAgentState({
      chatId: queued,
      handledBy: 'human_queue',
      useCase: 'GENERAL_INQUIRY',
    });

    const mine = await createChatFor(userId);
    await babbageContext.request.post(
      `/api/advisor/conversations/${mine}/take`,
      { data: {} },
    );

    const resolved = await createChatFor(userId);
    await babbageContext.request.post(
      `/api/advisor/conversations/${resolved}/take`,
      { data: {} },
    );
    await babbageContext.request.post(
      `/api/advisor/conversations/${resolved}/release`,
      { data: { outcome: 'resolved' } },
    );

    const advisorResponse = await babbageContext.request.get(
      `/api/advisor/conversations/counts?userId=${userId}`,
    );
    expect(advisorResponse.status()).toBe(200);
    expect(await advisorResponse.json()).toEqual({
      total: 2,
      byUseCase: { GENERAL_INQUIRY: 1 },
      withoutUseCase: 1,
      unattended: 1,
      mine: 1,
      resolved: 1,
      aiAgent: 1,
      aiAgentByUseCase: { CARD_BLOCK: 1 },
      withAdvisor: 1,
      byHandoffReason: { complaint: 0, retention: 0, case_status: 0 },
    });

    const adminResponse = await adaContext.request.get(
      `/api/advisor/conversations/counts?userId=${userId}`,
    );
    expect(adminResponse.status()).toBe(200);
    const adminCounts = await adminResponse.json();
    expect(adminCounts.mine).toBe(0); // babbage holds them, not ada
    expect(adminCounts.total).toBe(2);
    expect(adminCounts.resolved).toBe(1);
  });

  test('a customer gets 403', async ({ curieContext }) => {
    const response = await curieContext.request.get(
      '/api/advisor/conversations/counts',
    );
    expect(response.status()).toBe(403);
  });
});

test.describe('/api/advisor/conversations/counts (ephemeral mode)', () => {
  skipInWithDatabaseMode(test);

  test('returns 204 without a database', async ({ babbageContext }) => {
    const response = await babbageContext.request.get(
      '/api/advisor/conversations/counts',
    );
    expect(response.status()).toBe(204);
  });
});
