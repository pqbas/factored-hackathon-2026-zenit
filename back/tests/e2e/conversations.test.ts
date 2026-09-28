import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';
import { ChatPage } from '../pages/chat';
import { mockSessionRole, type Role } from '../session-role';

const ME = 'babbage@example.com';
const OTHER = 'ada@example.com';

type Chat = {
  id: string;
  title: string;
  createdAt: string;
  userId: string;
  userEmail: string | null;
  handledBy: 'ai_agent' | 'human_queue' | 'human_agent';
  assignedTo: string | null;
  assignedAt: string | null;
  closedAt: string | null;
  useCase: string | null;
};
type Message = {
  id: string;
  chatId: string;
  role: string;
  parts: { type: string; text: string }[];
  createdAt: string;
  senderType: 'customer' | 'ai_agent' | 'human_agent' | 'system' | null;
  senderId: string | null;
};

// An in-memory advisor API that follows the back's contract
// (back/spec/28-09-26-consola-asesor/requirements.md §1), served in the
// browser with page.route.
async function mockAdvisorApi(page: Page, me: string) {
  let seq = 0;
  const now = () => new Date(Date.UTC(2026, 8, 28, 10, 0, seq++)).toISOString();
  const chat = (id: string, email: string, extra: Partial<Chat>): Chat => ({
    id,
    title: `Consulta de ${email.split('@')[0]}`,
    createdAt: now(),
    userId: `${id}-user`,
    userEmail: email,
    handledBy: 'ai_agent',
    assignedTo: null,
    assignedAt: null,
    closedAt: null,
    useCase: 'UC-01',
    ...extra,
  });
  const chats: Chat[] = [
    chat('c-assistant', 'javier@banco.test', {}),
    chat('c-waiting', 'daniela@banco.test', { handledBy: 'human_queue' }),
    chat('c-race', 'santiago@banco.test', { handledBy: 'human_queue' }),
    chat('c-other', 'lucia@banco.test', {
      handledBy: 'human_agent',
      assignedTo: OTHER,
      assignedAt: now(),
    }),
    chat('c-closed', 'marta@banco.test', { closedAt: now() }),
  ];
  const messages: Message[] = [];
  const say = (chatId: string, senderType: Message['senderType'], text: string, senderId: string | null = null) => {
    const message: Message = {
      id: `m${seq}`,
      chatId,
      role: senderType === 'customer' ? 'user' : senderType === 'system' ? 'system' : 'assistant',
      parts: [{ type: 'text', text }],
      createdAt: now(),
      senderType,
      senderId,
    };
    messages.push(message);
    return message;
  };
  for (const c of chats) say(c.id, 'customer', `Hola, soy ${c.userEmail}`);
  say('c-waiting', 'system', 'Te atiende un asesor.');

  const requested: string[] = [];
  await page.route('**/api/advisor/conversations**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requested.push(url.pathname + url.search);
    const [, , , , id, action] = url.pathname.split('/');
    const target = chats.find((c) => c.id === id);
    const body = request.postDataJSON() ?? {};

    if (!id) {
      const q = url.searchParams;
      const list = chats.filter(
        (c) =>
          (q.get('status') === 'closed' ? !!c.closedAt : !c.closedAt) &&
          (!q.get('handledBy') || c.handledBy === q.get('handledBy')) &&
          (q.get('assignedTo') !== 'me' || c.assignedTo === me),
      );
      return route.fulfill({ json: { chats: list, hasMore: false } });
    }
    if (!target) return route.fulfill({ status: 404, json: { code: 'not_found:chat' } });

    if (action === 'messages' && request.method() === 'GET') {
      const all = messages.filter((m) => m.chatId === id);
      const after = url.searchParams.get('after');
      const index = after ? all.findIndex((m) => m.id === after) : -1;
      if (after && index < 0) return route.fulfill({ status: 400, json: {} });
      return route.fulfill({ json: all.slice(index + 1) });
    }
    if (action === 'take') {
      const heldByOther = target.assignedTo && target.assignedTo !== me;
      if (id === 'c-race' || (heldByOther && !body.force)) {
        return route.fulfill({
          status: 409,
          json: { code: 'conflict:chat', assignedTo: id === 'c-race' ? OTHER : target.assignedTo },
        });
      }
      Object.assign(target, { handledBy: 'human_agent', assignedTo: me, assignedAt: now(), closedAt: null });
      say(id, 'system', heldByOther ? 'Otro asesor continúa la conversación.' : 'Te atiende un asesor.');
      return route.fulfill({ json: { chat: target } });
    }
    if (action === 'messages') {
      if (target.assignedTo !== me) return route.fulfill({ status: 409, json: { code: 'conflict:chat' } });
      return route.fulfill({ status: 201, json: { message: say(id, 'human_agent', body.text, me) } });
    }
    if (action === 'release') {
      if (target.assignedTo !== me) return route.fulfill({ status: 409, json: { code: 'conflict:chat' } });
      Object.assign(target, {
        handledBy: 'ai_agent',
        assignedTo: null,
        closedAt: body.outcome === 'resolved' ? now() : null,
      });
      say(id, 'system', body.outcome === 'resolved' ? 'La conversación se cerró.' : 'Volviste con el asistente.');
      return route.fulfill({ json: { chat: target } });
    }
    return route.fulfill({ status: 400, json: {} });
  });
  return requested;
}

async function openConsole(page: Page, role: Role = 'advisor', email = ME) {
  await mockSessionRole(page, role, email);
  const requested = await mockAdvisorApi(page, email);
  await page.goto('/conversations');
  return requested;
}

const rows = (page: Page) => page.locator('[data-testid^="conversation-row-"]');
const headerStatus = (page: Page) => page.locator('header').getByTestId('status-chip');
const input = (page: Page) => page.getByLabel('Mensaje al cliente');

test.describe('Advisor console', () => {
  test('lists the open inbox and filters by the contract params', async ({ page }) => {
    const requested = await openConsole(page);
    await expect(rows(page)).toHaveCount(4);

    await page.getByTestId('status-filter-trigger').click();
    await page.getByTestId('status-filter-waiting').click();
    await expect(rows(page)).toHaveCount(2);
    expect(requested.some((u) => u.includes('handledBy=human_queue'))).toBe(true);

    // Wait for the menu to finish closing before opening it again.
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.getByTestId('status-filter-trigger').click();
    await page.getByTestId('status-filter-closed').click();
    await expect(rows(page)).toHaveCount(1);
    expect(requested.some((u) => u.includes('status=closed'))).toBe(true);
  });

  test('turning the assistant off takes the chat and lets the advisor reply', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('conversation-row-c-assistant').click();
    await expect(input(page)).toBeDisabled();

    await page.getByTestId('assistant-switch').click();
    await expect(headerStatus(page)).toHaveText('En atención');
    await expect(page.getByTestId('system-notice').last()).toContainText('Te atiende un asesor.');
    await expect(input(page)).toBeEnabled();

    await input(page).fill('Hola Javier, te escribe un asesor.');
    await input(page).press('Enter');
    await expect(page.getByTestId('bubble-advisor').last()).toHaveText('Tú');
    await expect(page.getByTestId('bubble-agent').last()).toContainText('te escribe un asesor');
  });

  test('taking a waiting chat, returning it and resolving', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('conversation-row-c-waiting').click();
    await page.getByTestId('take-button').click();
    await expect(headerStatus(page)).toHaveText('En atención');

    await page.getByTestId('assistant-switch').click();
    await expect(headerStatus(page)).toHaveText('Con asistente');
    await expect(input(page)).toBeDisabled();
    await expect(page.getByTestId('system-notice').last()).toContainText('Volviste con el asistente.');

    await page.getByTestId('assistant-switch').click();
    await page.getByTestId('resolve-button').click();
    await expect(headerStatus(page)).toHaveText('Resuelto');
    await expect(page.getByTestId('system-notice').last()).toContainText('La conversación se cerró.');
  });

  test('a 409 on take says who holds the chat', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('conversation-row-c-race').click();
    await page.getByTestId('take-button').click();
    await expect(page.getByText(`Ya la atiende ${OTHER}.`)).toBeVisible();
    await expect(input(page)).toBeDisabled();
  });

  test('a chat held by someone else is read-only for an advisor', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('conversation-row-c-other').click();
    await expect(page.getByTestId('customer-meta')).toContainText(`La atiende ${OTHER}`);
    await expect(input(page)).toBeDisabled();
    await expect(page.getByTestId('force-take-button')).toHaveCount(0);
  });

  test('an admin can take it over with force and then reply', async ({ page }) => {
    await openConsole(page, 'admin', 'root@example.com');
    await page.getByTestId('conversation-row-c-other').click();
    await page.getByTestId('force-take-button').click();
    await expect(page.getByTestId('customer-meta')).toContainText('La atiendes tú');
    await expect(page.getByTestId('system-notice').last()).toContainText('Otro asesor continúa');
    await expect(input(page)).toBeEnabled();
  });

  test('a quick reply fills the message field', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('conversation-row-c-assistant').click();
    await page.getByTestId('assistant-switch').click();
    await page.getByRole('button', { name: 'Respuestas rápidas' }).click();
    await page.getByTestId('quick-reply-0').click();
    await expect(input(page)).toHaveValue('Ya revisé tu caso.');
  });
});

test.describe('Nav rail', () => {
  test('switches between the agent and the chats sections', async ({
    adaContext,
  }) => {
    const page = await adaContext.context.newPage();
    await mockSessionRole(page, 'advisor');
    const chatPage = new ChatPage(page);
    await chatPage.createNewChat();
    await expect(page.getByTestId('nav-agent')).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByTestId('nav-chats').click();
    await expect(page).toHaveURL(/\/conversations$/);
    await expect(page.getByTestId('nav-chats')).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByTestId('nav-agent').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(chatPage.multimodalInput).toBeVisible();
    await page.close();
  });
});
