import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';
import { ChatPage } from '../pages/chat';

// The customer's chat while a person handles it. The chat, its messages and
// POST /api/chat are served in the browser following the back's contract
// (state-only stream while handledBy ≠ ai_agent; GET /api/messages/:id?after=).
const CHAT_ID = '0f6d1b9e-3c1a-4a55-9b1e-0000000000c1';

type Row = {
  id: string;
  chatId: string;
  role: string;
  parts: { type: string; text: string }[];
  attachments: [];
  createdAt: string;
  senderType: string | null;
  senderId: string | null;
};

async function mockHandoffChat(page: Page) {
  let seq = 0;
  const state = { handledBy: 'human_queue' as string };
  const rows: Row[] = [];
  const add = (role: string, text: string, senderType: string | null, id?: string) => {
    seq += 1;
    rows.push({
      id: id ?? `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
      chatId: CHAT_ID,
      role,
      parts: [{ type: 'text', text }],
      attachments: [],
      createdAt: new Date(Date.UTC(2026, 8, 28, 10, 0, seq)).toISOString(),
      senderType,
      senderId: senderType === 'human_agent' ? 'babbage@example.com' : null,
    });
  };
  add('user', 'Quiero hablar con un asesor', 'customer');
  add('assistant', 'Te derivo con un asesor.', 'ai_agent');

  // Ephemeral test runs report chat history off; this chat is a saved one.
  await page.route('**/api/config', (route) =>
    route.fulfill({ json: { features: { chatHistory: true } } }),
  );
  await page.route(`**/api/chat/${CHAT_ID}`, (route) =>
    route.fulfill({
      json: {
        id: CHAT_ID,
        title: 'Quiero hablar con un asesor',
        createdAt: '2026-09-28T10:00:00.000Z',
        userId: 'ada-id',
        visibility: 'private',
        lastContext: null,
        handledBy: state.handledBy,
      },
    }),
  );
  await page.route(`**/api/chat/${CHAT_ID}/stream`, (route) => route.fulfill({ status: 204 }));
  await page.route(`**/api/messages/${CHAT_ID}**`, (route) => {
    const after = new URL(route.request().url()).searchParams.get('after');
    const index = after ? rows.findIndex((r) => r.id === after) : -1;
    if (after && index < 0) return route.fulfill({ status: 400, json: {} });
    return route.fulfill({ json: rows.slice(index + 1) });
  });
  await page.route('**/api/chat', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON();
    const text = body.message?.parts?.find((p: { type: string }) => p.type === 'text')?.text ?? '';
    add('user', text, 'customer', body.message?.id);
    const events = [
      { type: 'start' },
      { type: 'data-conversation-state', data: { handledBy: state.handledBy } },
      { type: 'finish' },
    ];
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
      body: `${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}data: [DONE]\n\n`,
    });
  });

  return {
    advisorTakes(reply: string) {
      state.handledBy = 'human_agent';
      add('system', 'Te atiende un asesor.', 'system');
      add('assistant', reply, 'human_agent');
    },
    backToAgent() {
      state.handledBy = 'ai_agent';
      add('system', 'Volviste con el asistente.', 'system');
    },
  };
}

test.describe('Customer chat during a handoff', () => {
  test('waits for an advisor, shows the reply and goes back to the agent', async ({
    adaContext,
  }) => {
    const page = await adaContext.context.newPage();
    const chat = new ChatPage(page);
    const server = await mockHandoffChat(page);

    await page.goto(`/chat/${CHAT_ID}`);
    await expect(page.getByTestId('handoff-notice')).toContainText('Te pasamos con un asesor');
    const agentMessages = page.getByTestId('message-assistant');
    await expect(agentMessages).toHaveCount(1);

    // A state-only answer leaves no empty agent bubble behind.
    await chat.sendUserMessage('¿Hay alguien?');
    await expect(page.getByTestId('message-user')).toHaveCount(2);
    await page.waitForTimeout(500);
    await expect(agentMessages).toHaveCount(1);

    server.advisorTakes('Hola, soy Babbage. ¿En qué te ayudo?');
    await expect(page.getByTestId('advisor-label')).toBeVisible({ timeout: 10_000 });
    await expect(agentMessages.last()).toContainText('soy Babbage');
    await expect(page.getByTestId('handoff-system-message').last()).toHaveText('Te atiende un asesor.');
    await expect(page.getByTestId('handoff-notice')).toHaveText('Te atiende un asesor.');
    await expect(page.getByTestId('chat-peer')).toHaveText('Asesor');

    server.backToAgent();
    await expect(page.getByTestId('handoff-notice')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId('chat-peer')).toHaveText('Asistente');
    await expect(page.getByTestId('handoff-system-message').last()).toHaveText('Volviste con el asistente.');
    await page.close();
  });
});
