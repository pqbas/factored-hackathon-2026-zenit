import { expect, test } from '../fixtures';
import { generateUUID, getMessageByErrorCode } from '@chat-template/core';
import { TEST_PROMPTS } from '../prompts/routes';
import { skipInEphemeralMode, skipInWithDatabaseMode } from '../helpers';

async function createChat(
  userContext: { request: { post: Function } },
  message = TEST_PROMPTS.SKY.MESSAGE,
) {
  const chatId = generateUUID();
  await userContext.request.post('/api/chat', {
    data: {
      id: chatId,
      message,
      selectedChatModel: 'chat-model',
      selectedVisibilityType: 'private',
    },
  });
  return chatId;
}

test.describe('Supervision in the advisor console (with database)', () => {
  skipInEphemeralMode(test);

  test('the admin inbox includes chats from every user, with userEmail', async ({
    adaContext,
    babbageContext,
  }) => {
    const adaChatId = await createChat(adaContext);
    const babbageChatId = await createChat(
      babbageContext,
      TEST_PROMPTS.GRASS.MESSAGE,
    );

    // Other workers create chats in parallel on the same database; with the
    // default limit of 10 they can push these two off the first page.
    const response = await adaContext.request.get(
      '/api/advisor/conversations?limit=100&handledBy=ai_agent',
    );
    expect(response.status()).toBe(200);

    const { chats, hasMore } = await response.json();
    expect(Array.isArray(chats)).toBe(true);
    expect(typeof hasMore).toBe('boolean');

    const adaChat = chats.find((c: any) => c.id === adaChatId);
    const babbageChat = chats.find((c: any) => c.id === babbageChatId);
    expect(adaChat).toBeTruthy();
    expect(babbageChat).toBeTruthy();
    expect(adaChat.userEmail).toBe(`${adaContext.name}@example.com`);
    expect(babbageChat.userEmail).toBe(`${babbageContext.name}@example.com`);
  });

  test('the inbox filters by userId', async ({
    adaContext,
    babbageContext,
  }) => {
    const babbageChatId = await createChat(
      babbageContext,
      TEST_PROMPTS.GRASS.MESSAGE,
    );
    const babbageUserId = `${babbageContext.name}-id`;

    const response = await adaContext.request.get(
      `/api/advisor/conversations?userId=${babbageUserId}&handledBy=ai_agent`,
    );
    expect(response.status()).toBe(200);

    const { chats } = await response.json();
    expect(chats.some((c: any) => c.id === babbageChatId)).toBe(true);
    for (const chat of chats) {
      expect(chat.userId).toBe(babbageUserId);
    }
  });

  test('/api/advisor/users lists users that own a chat, once each', async ({
    adaContext,
    babbageContext,
  }) => {
    await createChat(adaContext);
    await createChat(babbageContext, TEST_PROMPTS.GRASS.MESSAGE);

    const response = await adaContext.request.get('/api/advisor/users');
    expect(response.status()).toBe(200);

    const { users } = await response.json();
    const emails = users.map((u: any) => u.userEmail);
    expect(emails).toContain(`${adaContext.name}@example.com`);
    expect(emails).toContain(`${babbageContext.name}@example.com`);

    // One row per user, even when older chats of that user have no email.
    const userIds = users.map((u: any) => u.userId);
    expect(new Set(userIds).size).toBe(userIds.length);
  });

  test("the admin reads another user's private chat in the console", async ({
    adaContext,
    babbageContext,
  }) => {
    const babbageChatId = await createChat(
      babbageContext,
      TEST_PROMPTS.GRASS.MESSAGE,
    );

    const response = await adaContext.request.get(
      `/api/advisor/conversations/${babbageChatId}/messages`,
    );
    expect(response.status()).toBe(200);

    const messages = await response.json();
    expect(Array.isArray(messages)).toBe(true);
    expect(messages.length).toBeGreaterThan(0);
  });

  test("GET /api/history as Ada still excludes Babbage's chat", async ({
    adaContext,
    babbageContext,
  }) => {
    const babbageChatId = await createChat(
      babbageContext,
      TEST_PROMPTS.GRASS.MESSAGE,
    );

    const response = await adaContext.request.get('/api/history');
    expect(response.status()).toBe(200);

    const { chats } = await response.json();
    expect(chats.some((c: any) => c.id === babbageChatId)).toBe(false);
  });

  test('a customer gets 403 on the supervision reads; an advisor on /users', async ({
    curieContext,
    babbageContext,
  }) => {
    const chatsResponse = await curieContext.request.get(
      '/api/advisor/conversations',
    );
    expect(chatsResponse.status()).toBe(403);
    const chatsBody = await chatsResponse.json();
    expect(chatsBody.code).toEqual('forbidden:chat');
    expect(chatsBody.message).toEqual(getMessageByErrorCode('forbidden:chat'));

    const messagesResponse = await curieContext.request.get(
      `/api/advisor/conversations/${generateUUID()}/messages`,
    );
    expect(messagesResponse.status()).toBe(403);

    const usersResponse =
      await babbageContext.request.get('/api/advisor/users');
    expect(usersResponse.status()).toBe(403);
  });

  test('the old /api/admin routes are gone', async ({ adaContext }) => {
    for (const path of [
      '/api/admin/chats',
      '/api/admin/users',
      `/api/admin/chats/${generateUUID()}/messages`,
    ]) {
      expect((await adaContext.request.get(path)).status()).toBe(404);
    }
  });

  test('console messages return 404 for a chat that does not exist', async ({
    adaContext,
  }) => {
    const response = await adaContext.request.get(
      `/api/advisor/conversations/${generateUUID()}/messages`,
    );
    expect(response.status()).toBe(404);

    const { code, message } = await response.json();
    expect(code).toEqual('not_found:chat');
    expect(message).toEqual(getMessageByErrorCode('not_found:chat'));
  });
});

test.describe('Supervision in the advisor console (ephemeral mode)', () => {
  skipInWithDatabaseMode(test);

  test('the supervision reads return 204 when the database is disabled', async ({
    adaContext,
  }) => {
    const chatsResponse = await adaContext.request.get(
      '/api/advisor/conversations',
    );
    expect(chatsResponse.status()).toBe(204);

    const usersResponse = await adaContext.request.get('/api/advisor/users');
    expect(usersResponse.status()).toBe(204);

    const messagesResponse = await adaContext.request.get(
      `/api/advisor/conversations/${generateUUID()}/messages`,
    );
    expect(messagesResponse.status()).toBe(204);
  });
});
