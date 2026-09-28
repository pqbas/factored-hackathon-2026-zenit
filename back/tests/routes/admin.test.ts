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

test.describe('/api/admin (with database)', () => {
  skipInEphemeralMode(test);

  test('GET /api/admin/chats as admin includes chats from every user', async ({
    adaContext,
    babbageContext,
  }) => {
    const adaChatId = await createChat(adaContext);
    const babbageChatId = await createChat(
      babbageContext,
      TEST_PROMPTS.GRASS.MESSAGE,
    );

    const response = await adaContext.request.get('/api/admin/chats');
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

  test('GET /api/admin/chats?userId= filters to that user', async ({
    adaContext,
    babbageContext,
  }) => {
    const babbageChatId = await createChat(
      babbageContext,
      TEST_PROMPTS.GRASS.MESSAGE,
    );
    const babbageUserId = `${babbageContext.name}-id`;

    const response = await adaContext.request.get(
      `/api/admin/chats?userId=${babbageUserId}`,
    );
    expect(response.status()).toBe(200);

    const { chats } = await response.json();
    expect(chats.some((c: any) => c.id === babbageChatId)).toBe(true);
    for (const chat of chats) {
      expect(chat.userId).toBe(babbageUserId);
    }
  });

  test('GET /api/admin/users includes users that own a chat', async ({
    adaContext,
    babbageContext,
  }) => {
    await createChat(adaContext);
    await createChat(babbageContext, TEST_PROMPTS.GRASS.MESSAGE);

    const response = await adaContext.request.get('/api/admin/users');
    expect(response.status()).toBe(200);

    const { users } = await response.json();
    const emails = users.map((u: any) => u.userEmail);
    expect(emails).toContain(`${adaContext.name}@example.com`);
    expect(emails).toContain(`${babbageContext.name}@example.com`);

    // One row per user, even when older chats of that user have no email.
    const userIds = users.map((u: any) => u.userId);
    expect(new Set(userIds).size).toBe(userIds.length);
  });

  test("GET /api/admin/chats/:id/messages as admin reads another user's private chat", async ({
    adaContext,
    babbageContext,
  }) => {
    const babbageChatId = await createChat(
      babbageContext,
      TEST_PROMPTS.GRASS.MESSAGE,
    );

    const response = await adaContext.request.get(
      `/api/admin/chats/${babbageChatId}/messages`,
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

  test('a non-admin user gets 403 on the three admin routes', async ({
    babbageContext,
  }) => {
    const chatsResponse = await babbageContext.request.get('/api/admin/chats');
    expect(chatsResponse.status()).toBe(403);
    const chatsBody = await chatsResponse.json();
    expect(chatsBody.code).toEqual('forbidden:chat');
    expect(chatsBody.message).toEqual(getMessageByErrorCode('forbidden:chat'));

    const usersResponse = await babbageContext.request.get('/api/admin/users');
    expect(usersResponse.status()).toBe(403);

    const messagesResponse = await babbageContext.request.get(
      `/api/admin/chats/${generateUUID()}/messages`,
    );
    expect(messagesResponse.status()).toBe(403);
  });

  test('GET /api/admin/chats/:id/messages returns 404 for a chat that does not exist', async ({
    adaContext,
  }) => {
    const response = await adaContext.request.get(
      `/api/admin/chats/${generateUUID()}/messages`,
    );
    expect(response.status()).toBe(404);

    const { code, message } = await response.json();
    expect(code).toEqual('not_found:chat');
    expect(message).toEqual(getMessageByErrorCode('not_found:chat'));
  });
});

test.describe('/api/admin (ephemeral mode)', () => {
  skipInWithDatabaseMode(test);

  test('the three admin routes return 204 when the database is disabled', async ({
    adaContext,
  }) => {
    const chatsResponse = await adaContext.request.get('/api/admin/chats');
    expect(chatsResponse.status()).toBe(204);

    const usersResponse = await adaContext.request.get('/api/admin/users');
    expect(usersResponse.status()).toBe(204);

    const messagesResponse = await adaContext.request.get(
      `/api/admin/chats/${generateUUID()}/messages`,
    );
    expect(messagesResponse.status()).toBe(204);
  });
});
