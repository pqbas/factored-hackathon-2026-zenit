import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import {
  saveChat,
  saveMessages,
  getChatById,
  getMessagesByChatId,
} from '@chat-template/db';
import { skipInEphemeralMode } from '../helpers';

// Never curie: history.test.ts expects curie to have no chats.
// A second advisor, via headers on babbage's context (ADVISOR_EMAILS in
// playwright.config.ts). curie must stay chat-free, and ada is an admin, who
// only supervises.
const ASESOR2 = {
  'X-Forwarded-User': 'asesor2',
  'X-Forwarded-Email': 'asesor2@example.com',
};

async function createChat(ownerContext: { name: string }) {
  const chatId = generateUUID();
  await saveChat({
    id: chatId,
    userId: `${ownerContext.name}-id`,
    userEmail: `${ownerContext.name}@example.com`,
    title: 'Advisor console test chat',
    visibility: 'private',
  });
  return chatId;
}

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
  return userContext.request.post('/api/chat', {
    data: {
      id: chatId,
      message: textMessage(text),
      selectedChatModel: 'chat-model',
      selectedVisibilityType: 'private',
    },
  });
}

test.describe('/api/advisor (with database)', () => {
  skipInEphemeralMode(test);

  test.describe('permissions', () => {
    test('a customer gets 403 on every advisor route', async ({
      curieContext,
    }) => {
      const chatId = generateUUID();

      const conversations = await curieContext.request.get(
        '/api/advisor/conversations',
      );
      expect(conversations.status()).toBe(403);

      const messages = await curieContext.request.get(
        `/api/advisor/conversations/${chatId}/messages`,
      );
      expect(messages.status()).toBe(403);

      const take = await curieContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );
      expect(take.status()).toBe(403);

      const send = await curieContext.request.post(
        `/api/advisor/conversations/${chatId}/messages`,
        { data: { text: 'hola' } },
      );
      expect(send.status()).toBe(403);

      const release = await curieContext.request.post(
        `/api/advisor/conversations/${chatId}/release`,
        { data: { outcome: 'resolved' } },
      );
      expect(release.status()).toBe(403);
    });

    test('the admin reads the console but gets 403 on every write', async ({
      babbageContext,
      adaContext,
    }) => {
      const chatId = await createChat(babbageContext);

      const inbox = await adaContext.request.get(
        '/api/advisor/conversations?limit=100',
      );
      expect(inbox.status()).toBe(200);
      const messages = await adaContext.request.get(
        `/api/advisor/conversations/${chatId}/messages`,
      );
      expect(messages.status()).toBe(200);

      for (const [path, data] of [
        ['take', {}],
        ['messages', { text: 'hola' }],
        ['release', { outcome: 'resolved' }],
      ] as const) {
        const response = await adaContext.request.post(
          `/api/advisor/conversations/${chatId}/${path}`,
          { data },
        );
        expect(response.status()).toBe(403);
        expect((await response.json()).code).toBe('forbidden:chat');
      }
    });

    test('/users is for the admin only', async ({
      adaContext,
      babbageContext,
      curieContext,
    }) => {
      expect(
        (await adaContext.request.get('/api/advisor/users')).status(),
      ).toBe(200);
      expect(
        (await babbageContext.request.get('/api/advisor/users')).status(),
      ).toBe(403);
      expect(
        (await curieContext.request.get('/api/advisor/users')).status(),
      ).toBe(403);
    });

    test('force is ignored: it neither reassigns nor errors', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {}, headers: ASESOR2 },
      );

      const response = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: { force: true } },
      );
      expect(response.status()).toBe(409);
      expect((await response.json()).assignedTo).toBe('asesor2@example.com');
    });
  });

  test.describe('take', () => {
    test('an advisor takes a free chat and logs the generic system message', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);

      const response = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );
      expect(response.status()).toBe(200);

      const { chat } = await response.json();
      expect(chat.handledBy).toBe('human_agent');
      expect(chat.assignedTo).toBe(`${babbageContext.name}@example.com`);
      expect(chat.closedAt).toBeNull();

      const messages = await getMessagesByChatId({ id: chatId });
      const systemMessages = messages.filter((m) => m.role === 'system');
      expect(systemMessages).toHaveLength(1);
      expect(systemMessages[0].senderType).toBe('system');
      expect(systemMessages[0].senderId).toBeNull();

      const text = (systemMessages[0].parts as Array<{ text: string }>)[0].text;
      expect(text).toBe('Te atiende un asesor.');
      expect(text).not.toContain(babbageContext.name);
      expect(text).not.toContain('@example.com');
    });

    test('taking a chat already mine is idempotent and does not repeat the system message', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );
      const second = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );
      expect(second.status()).toBe(200);

      const messages = await getMessagesByChatId({ id: chatId });
      expect(messages.filter((m) => m.role === 'system')).toHaveLength(1);
    });

    test('another advisor gets a 409 conflict with assignedTo', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );

      const response = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {}, headers: ASESOR2 },
      );
      expect(response.status()).toBe(409);
      const body = await response.json();
      expect(body.code).toBe('conflict:chat');
      expect(body.assignedTo).toBe(`${babbageContext.name}@example.com`);
    });

    test('the same advisor with a differently capitalized email keeps the chat', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      const shouting = {
        'X-Forwarded-Email': `${babbageContext.name}@example.com`.toUpperCase(),
      };

      const take = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {}, headers: shouting },
      );
      expect(take.status()).toBe(200);
      const { chat } = await take.json();
      expect(chat.assignedTo).toBe(`${babbageContext.name}@example.com`);

      // Lowercase and uppercase requests are the same owner: no 409.
      const retake = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );
      expect(retake.status()).toBe(200);

      const reply = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/messages`,
        { data: { text: 'Hola' }, headers: shouting },
      );
      expect(reply.status()).toBe(201);
      expect((await reply.json()).message.senderId).toBe(
        `${babbageContext.name}@example.com`,
      );

      const release = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/release`,
        { data: { outcome: 'returned_to_agent' }, headers: shouting },
      );
      expect(release.status()).toBe(200);
    });

    test('two simultaneous takes of a free chat: exactly one wins', async ({
      babbageContext,
    }) => {
      for (let i = 0; i < 5; i++) {
        const chatId = await createChat(babbageContext);
        const statuses = (
          await Promise.all(
            [{}, ASESOR2].map((headers) =>
              babbageContext.request.post(
                `/api/advisor/conversations/${chatId}/take`,
                { data: {}, headers },
              ),
            ),
          )
        ).map((r) => r.status());
        expect(statuses.sort()).toEqual([200, 409]);
      }
    });

    test('taking a nonexistent chat returns 404', async ({
      babbageContext,
    }) => {
      const response = await babbageContext.request.post(
        `/api/advisor/conversations/${generateUUID()}/take`,
        { data: {} },
      );
      expect(response.status()).toBe(404);
    });
  });

  test.describe('messages', () => {
    test('only the advisor who took the chat can send a message; another advisor gets 409', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );

      const response = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/messages`,
        { data: { text: 'Hola, soy tu asesor' } },
      );
      expect(response.status()).toBe(201);
      const { message } = await response.json();
      expect(message.senderType).toBe('human_agent');
      expect(message.senderId).toBe(`${babbageContext.name}@example.com`);

      const otherAttempt = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/messages`,
        { data: { text: 'yo tambien quiero responder' }, headers: ASESOR2 },
      );
      expect(otherAttempt.status()).toBe(409);
    });

    test('an untaken chat rejects advisor messages with 409', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      const response = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/messages`,
        { data: { text: 'hola' } },
      );
      expect(response.status()).toBe(409);
    });

    test('rejects a message body outside 1-4000 characters', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );

      const empty = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/messages`,
        { data: { text: '' } },
      );
      expect(empty.status()).toBe(400);

      const tooLong = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/messages`,
        { data: { text: 'x'.repeat(4001) } },
      );
      expect(tooLong.status()).toBe(400);
    });

    test('the customer sees the advisor message via ?after=, tagged human_agent', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );
      const beforeReply = await getMessagesByChatId({ id: chatId });
      const lastBeforeReply = beforeReply[beforeReply.length - 1];

      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/messages`,
        { data: { text: 'Como te puedo ayudar?' } },
      );

      const response = await babbageContext.request.get(
        `/api/messages/${chatId}?after=${lastBeforeReply.id}`,
      );
      expect(response.status()).toBe(200);
      const messages = await response.json();
      expect(messages).toHaveLength(1);
      expect(messages[0].senderType).toBe('human_agent');
      // Customer routes never expose the advisor's email; the console does.
      expect(messages[0].senderId).toBeNull();

      const consoleResponse = await babbageContext.request.get(
        `/api/advisor/conversations/${chatId}/messages?after=${lastBeforeReply.id}`,
      );
      const consoleMessages = await consoleResponse.json();
      expect(consoleMessages[0].senderId).toBe(
        `${babbageContext.name}@example.com`,
      );

      const chat = await (
        await babbageContext.request.get(`/api/chat/${chatId}`)
      ).json();
      expect(chat.handledBy).toBe('human_agent');
      expect(chat.assignedTo).toBeNull();

      const { chats } = await (
        await babbageContext.request.get('/api/history?limit=100')
      ).json();
      const historyChat = chats.find((c: any) => c.id === chatId);
      expect(historyChat.assignedTo).toBeNull();

      const { chats: inbox } = await (
        await babbageContext.request.get(
          '/api/advisor/conversations?assignedTo=me&limit=100',
        )
      ).json();
      expect(inbox.find((c: any) => c.id === chatId).assignedTo).toBe(
        `${babbageContext.name}@example.com`,
      );
    });

    test('?after= from a different chat returns 400 on both routes', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      const otherChatId = await createChat(babbageContext);
      const foreignMessageId = generateUUID();
      await saveMessages({
        messages: [
          {
            id: foreignMessageId,
            chatId: otherChatId,
            role: 'user',
            parts: [{ type: 'text', text: 'de otro chat' }],
            attachments: [],
            createdAt: new Date(),
            blocked: false,
          },
        ],
      });

      const advisorResponse = await babbageContext.request.get(
        `/api/advisor/conversations/${chatId}/messages?after=${foreignMessageId}`,
      );
      expect(advisorResponse.status()).toBe(400);

      const customerResponse = await babbageContext.request.get(
        `/api/messages/${chatId}?after=${foreignMessageId}`,
      );
      expect(customerResponse.status()).toBe(400);
    });

    test('?after= that does not exist returns 400', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      const response = await babbageContext.request.get(
        `/api/advisor/conversations/${chatId}/messages?after=${generateUUID()}`,
      );
      expect(response.status()).toBe(400);
    });

    test('GET /conversations/:id/messages 404s for a chat that does not exist', async ({
      babbageContext,
    }) => {
      const response = await babbageContext.request.get(
        `/api/advisor/conversations/${generateUUID()}/messages`,
      );
      expect(response.status()).toBe(404);
    });
  });

  test.describe('release', () => {
    test('returned_to_agent frees the chat and logs the generic system message', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );

      const response = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/release`,
        { data: { outcome: 'returned_to_agent' } },
      );
      expect(response.status()).toBe(200);
      const { chat } = await response.json();
      expect(chat.handledBy).toBe('ai_agent');
      expect(chat.assignedTo).toBeNull();
      expect(chat.closedAt).toBeNull();

      const messages = await getMessagesByChatId({ id: chatId });
      const systemMessages = messages.filter((m) => m.role === 'system');
      const lastSystem = systemMessages[systemMessages.length - 1];
      const text = (lastSystem.parts as Array<{ text: string }>)[0].text;
      expect(text).toBe('Volviste con David.');
      expect(lastSystem.senderId).toBeNull();
      expect(text).not.toContain(babbageContext.name);
      expect(text).not.toContain('@example.com');
    });

    test('resolved closes the chat, and the customer writing again reopens it', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );

      const response = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/release`,
        { data: { outcome: 'resolved' } },
      );
      expect(response.status()).toBe(200);
      const { chat } = await response.json();
      expect(chat.closedAt).toBeTruthy();

      const messages = await getMessagesByChatId({ id: chatId });
      const lastSystem = messages.filter((m) => m.role === 'system').at(-1) as {
        parts: Array<{ text: string }>;
      };
      expect(lastSystem.parts[0].text).toBe('La conversación se cerró.');

      const followUp = await postChatMessage(
        babbageContext,
        chatId,
        `sigo con una duda ${generateUUID()}`,
      );
      expect(followUp.status()).toBe(200);

      const reopened = await getChatById({ id: chatId });
      expect(reopened?.closedAt).toBeNull();
    });

    test('an advisor releasing a chat assigned to someone else gets 409', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {}, headers: ASESOR2 },
      );

      const response = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/release`,
        { data: { outcome: 'returned_to_agent' } },
      );
      expect(response.status()).toBe(409);
    });

    test('an advisor releasing an untaken chat gets 409', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      const response = await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/release`,
        { data: { outcome: 'returned_to_agent' } },
      );
      expect(response.status()).toBe(409);
    });

    test('release 404s for a chat that does not exist', async ({
      babbageContext,
    }) => {
      const response = await babbageContext.request.post(
        `/api/advisor/conversations/${generateUUID()}/release`,
        { data: { outcome: 'resolved' } },
      );
      expect(response.status()).toBe(404);
    });
  });

  test.describe('history sent to the agent', () => {
    test('after an advisor turn, the next agent request carries [Asesor] and no system notices', async ({
      babbageContext,
    }) => {
      const chatId = generateUUID();
      const firstText = `pregunta inicial ${generateUUID()}`;
      await postChatMessage(babbageContext, chatId, firstText);

      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );
      const advisorText = `respuesta del asesor ${generateUUID()}`;
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/messages`,
        { data: { text: advisorText } },
      );
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/release`,
        { data: { outcome: 'returned_to_agent' } },
      );

      const followUpText = `siguiente pregunta ${generateUUID()}`;
      await postChatMessage(babbageContext, chatId, followUpText);

      const captured = (await (
        await babbageContext.request.get('/api/test/captured-requests')
      ).json()) as Array<{
        context?: { conversation_id?: string };
        input?: unknown;
      }>;
      const chatRequests = captured.filter(
        (r) => r.context?.conversation_id === chatId,
      );
      expect(chatRequests).toHaveLength(2);

      const secondInput = JSON.stringify(chatRequests[1].input);
      expect(secondInput).toContain(`[Asesor] ${advisorText}`);
      expect(secondInput).toContain(followUpText);
      expect(secondInput).not.toContain('Te atiende un asesor.');
      expect(secondInput).not.toContain('Volviste con David.');
    });
  });

  test.describe('bandeja filters', () => {
    test("each inbox chat carries the customer's last message as lastMessage", async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      const inboxRow = async () => {
        const { chats } = await (
          await babbageContext.request.get(
            `/api/advisor/conversations?userId=${babbageContext.name}-id&limit=100`,
          )
        ).json();
        return chats.find((c: any) => c.id === chatId);
      };

      expect((await inboxRow()).lastMessage).toBeNull();

      const longQuestion = `Hola   ${'a'.repeat(200)}`;
      await (await postChatMessage(babbageContext, chatId, longQuestion)).text();

      // The advisor takes the chat and replies: the row keeps showing what the
      // customer said last, not the agent's, the advisor's or the notices.
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/take`,
        { data: {} },
      );
      await babbageContext.request.post(
        `/api/advisor/conversations/${chatId}/messages`,
        { data: { text: 'Respuesta del asesor' } },
      );

      const { lastMessage } = await inboxRow();
      expect(lastMessage.senderType).toBe('customer');
      expect(lastMessage.text).toHaveLength(140);
      expect(lastMessage.text.startsWith('Hola a')).toBe(true);
      expect(lastMessage.text.endsWith('…')).toBe(true);
      expect(typeof lastMessage.createdAt).toBe('string');

      // Customer routes don't carry the preview.
      const { chats } = await (
        await babbageContext.request.get('/api/history?limit=100')
      ).json();
      const historyRow = chats.find((c: any) => c.id === chatId);
      expect(historyRow).toBeDefined();
      expect(historyRow).not.toHaveProperty('lastMessage');
    });

    test('a message from before senderType counts as the customer when its role is user', async ({
      babbageContext,
    }) => {
      const chatId = await createChat(babbageContext);
      await saveMessages({
        messages: [
          {
            id: generateUUID(),
            chatId,
            role: 'user',
            parts: [{ type: 'text', text: 'mensaje viejo del cliente' }],
            attachments: [],
            createdAt: new Date(),
            blocked: false,
            senderType: null,
            senderId: null,
          },
        ],
      });

      const { chats } = await (
        await babbageContext.request.get(
          `/api/advisor/conversations?userId=${babbageContext.name}-id&limit=100`,
        )
      ).json();
      const row = chats.find((c: any) => c.id === chatId);
      expect(row.lastMessage.text).toBe('mensaje viejo del cliente');
      expect(row.lastMessage.senderType).toBeNull();
    });

    test('assignedTo=me, status and handledBy filter the inbox', async ({
      babbageContext,
    }) => {
      const mine = await createChat(babbageContext);
      await babbageContext.request.post(
        `/api/advisor/conversations/${mine}/take`,
        { data: {} },
      );

      const others = await createChat(babbageContext);
      await babbageContext.request.post(
        `/api/advisor/conversations/${others}/take`,
        { data: {}, headers: ASESOR2 },
      );

      const mineResponse = await babbageContext.request.get(
        '/api/advisor/conversations?assignedTo=me',
      );
      expect(mineResponse.status()).toBe(200);
      const { chats: mineChats } = await mineResponse.json();
      expect(mineChats.some((c: any) => c.id === mine)).toBe(true);
      expect(mineChats.some((c: any) => c.id === others)).toBe(false);

      const handledByResponse = await babbageContext.request.get(
        '/api/advisor/conversations?handledBy=human_agent',
      );
      expect(handledByResponse.status()).toBe(200);
      const { chats: handledByChats } = await handledByResponse.json();
      expect(
        handledByChats.every((c: any) => c.handledBy === 'human_agent'),
      ).toBe(true);

      await babbageContext.request.post(
        `/api/advisor/conversations/${mine}/release`,
        { data: { outcome: 'resolved' } },
      );

      const openResponse = await babbageContext.request.get(
        '/api/advisor/conversations?status=open',
      );
      const { chats: openChats } = await openResponse.json();
      expect(openChats.some((c: any) => c.id === mine)).toBe(false);

      const closedResponse = await babbageContext.request.get(
        '/api/advisor/conversations?status=closed',
      );
      const { chats: closedChats } = await closedResponse.json();
      expect(closedChats.some((c: any) => c.id === mine)).toBe(true);
    });
  });
});
