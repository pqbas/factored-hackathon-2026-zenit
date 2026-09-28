import { expect, test } from '../fixtures';
import { generateUUID } from '@chat-template/core';
import {
  saveChat,
  updateChatAgentState,
  markMessagesBlocked,
  getMessagesByChatId,
  getChatById,
} from '@chat-template/db';
import { skipInEphemeralMode } from '../helpers';

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

// A chat that is already handed off before the user's next message ever
// arrives: created directly in the DB, never going through the agent.
async function createHumanQueueChat(userContext: { name: string }) {
  const chatId = generateUUID();
  await saveChat({
    id: chatId,
    userId: `${userContext.name}-id`,
    userEmail: `${userContext.name}@example.com`,
    title: 'Human queue chat',
    visibility: 'private',
  });
  await updateChatAgentState({ chatId, handledBy: 'human_queue' });
  return chatId;
}

test.describe('Conversation state (with database)', () => {
  skipInEphemeralMode(test);

  test('a chat handled by a human queue saves the message but does not call the agent', async ({
    adaContext,
  }) => {
    const chatId = await createHumanQueueChat(adaContext);
    const text = `question for the queue ${generateUUID()}`;

    const response = await postChatMessage(adaContext, chatId, text);
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain('"type":"start"');
    expect(body).toContain('"type":"data-conversation-state"');
    expect(body).toContain('"handledBy":"human_queue"');
    expect(body).toContain('"type":"finish"');

    const capturedResponse = await adaContext.request.get(
      '/api/test/captured-requests',
    );
    const capturedRequests = (await capturedResponse.json()) as Array<{
      context?: { conversation_id?: string };
    }>;
    const chatRequests = capturedRequests.filter(
      (r) => r.context?.conversation_id === chatId,
    );
    expect(chatRequests.length).toBe(0);

    const messagesResponse = await adaContext.request.get(
      `/api/messages/${chatId}`,
    );
    const messages = await messagesResponse.json();
    expect(messages.length).toBe(1);
    expect(messages[0].role).toBe('user');
  });

  test('blocked messages are not resent to the agent on the next turn', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    const blockedText = `blocked question ${generateUUID()}`;

    const firstResponse = await postChatMessage(
      adaContext,
      chatId,
      blockedText,
    );
    expect(firstResponse.status()).toBe(200);

    const firstTurnMessages = await getMessagesByChatId({ id: chatId });
    expect(firstTurnMessages.length).toBe(2);
    await markMessagesBlocked({
      ids: firstTurnMessages.map((m) => m.id),
    });

    const followUpText = `follow up question ${generateUUID()}`;
    const secondResponse = await postChatMessage(
      adaContext,
      chatId,
      followUpText,
    );
    expect(secondResponse.status()).toBe(200);

    const capturedResponse = await adaContext.request.get(
      '/api/test/captured-requests',
    );
    const capturedRequests = (await capturedResponse.json()) as Array<{
      context?: { conversation_id?: string };
      input?: unknown;
    }>;
    const chatRequests = capturedRequests.filter(
      (r) => r.context?.conversation_id === chatId,
    );
    expect(chatRequests.length).toBe(2);

    const secondTurnInput = JSON.stringify(chatRequests[1].input);
    expect(secondTurnInput).toContain(followUpText);
    expect(secondTurnInput).not.toContain(blockedText);
  });

  test('/api/history filters by handledBy and useCase', async ({
    babbageContext,
  }) => {
    const humanQueueChatId = await createHumanQueueChat(babbageContext);

    const normalChatId = generateUUID();
    await postChatMessage(
      babbageContext,
      normalChatId,
      `general inquiry ${generateUUID()}`,
    );
    await updateChatAgentState({
      chatId: normalChatId,
      useCase: 'GENERAL_INQUIRY',
    });

    const handledByResponse = await babbageContext.request.get(
      '/api/history?handledBy=human_queue',
    );
    expect(handledByResponse.status()).toBe(200);
    const { chats: handledByChats } = await handledByResponse.json();
    expect(handledByChats.some((c: any) => c.id === humanQueueChatId)).toBe(
      true,
    );
    expect(
      handledByChats.every((c: any) => c.handledBy === 'human_queue'),
    ).toBe(true);
    expect(handledByChats.some((c: any) => c.id === normalChatId)).toBe(false);

    const useCaseResponse = await babbageContext.request.get(
      '/api/history?useCase=GENERAL_INQUIRY',
    );
    expect(useCaseResponse.status()).toBe(200);
    const { chats: useCaseChats } = await useCaseResponse.json();
    expect(useCaseChats.some((c: any) => c.id === normalChatId)).toBe(true);
    expect(
      useCaseChats.every((c: any) => c.useCase === 'GENERAL_INQUIRY'),
    ).toBe(true);
  });

  // Not curie: history.test.ts expects curie to have no chats at all.
  test('/api/history ignores status and customer params', async ({
    babbageContext,
  }) => {
    const chatId = generateUUID();
    await postChatMessage(
      babbageContext,
      chatId,
      `ignored filters ${generateUUID()}`,
    );

    const response = await babbageContext.request.get(
      '/api/history?status=open&customer=whoever',
    );
    expect(response.status()).toBe(200);
    const { chats } = await response.json();
    expect(chats.some((c: any) => c.id === chatId)).toBe(true);
  });

  test('POST /api/internal/background-check-received no longer exists', async ({
    adaContext,
  }) => {
    const response = await adaContext.request.post(
      '/api/internal/background-check-received',
      { data: { chatId: generateUUID() } },
    );
    expect(response.status()).toBe(404);
  });

  test("a turn stores the agent's use_case, intent and language", async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    const response = await postChatMessage(
      adaContext,
      chatId,
      '[agent-outputs:state] ¿Cuál es mi saldo?',
    );
    expect(response.status()).toBe(200);
    await response.text();

    await expect
      .poll(async () => (await getChatById({ id: chatId }))?.useCase)
      .toBe('GENERAL_INQUIRY');
    const chat = await getChatById({ id: chatId });
    expect(chat?.intent).toBe('GENERAL_INQUIRY');
    expect(chat?.language).toBe('es');
    expect(chat?.handledBy).toBe('ai_agent');
  });

  test('a blocked turn marks both messages and is not resent to the agent', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    const first = await postChatMessage(
      adaContext,
      chatId,
      '[agent-outputs:blocked] mensaje rechazado',
    );
    await first.text();

    await expect
      .poll(
        async () =>
          (await getMessagesByChatId({ id: chatId })).filter((m) => m.blocked)
            .length,
      )
      .toBe(2);

    const second = await postChatMessage(adaContext, chatId, 'otra pregunta');
    await second.text();

    const captured = (await (
      await adaContext.request.get('/api/test/captured-requests')
    ).json()) as Array<{
      context?: { conversation_id?: string };
      input?: unknown;
    }>;
    const chatRequests = captured.filter(
      (req) => req.context?.conversation_id === chatId,
    );
    expect(chatRequests).toHaveLength(2);
    expect(JSON.stringify(chatRequests[1].input)).not.toContain(
      'mensaje rechazado',
    );
  });

  test('a turn with a handoff moves the chat to the human queue', async ({
    adaContext,
  }) => {
    const chatId = generateUUID();
    const response = await postChatMessage(
      adaContext,
      chatId,
      '[agent-outputs:handoff] quiero hablar con un asesor',
    );
    await response.text();

    await expect
      .poll(async () => (await getChatById({ id: chatId }))?.handledBy)
      .toBe('human_queue');
  });
});
