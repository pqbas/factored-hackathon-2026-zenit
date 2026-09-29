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
  lastMessage?: { text: string; senderType: string; createdAt: string } | null;
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
async function mockAdvisorApi(page: Page, me: string, role: Role = 'advisor') {
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
    useCase: 'GENERAL_INQUIRY',
    ...extra,
  });
  const chats: Chat[] = [
    chat('c-assistant', 'javier@banco.test', {}),
    chat('c-waiting', 'daniela@banco.test', {
      handledBy: 'human_queue',
      lastMessage: { text: 'Es urgente, por favor', senderType: 'customer', createdAt: now() },
    }),
    chat('c-race', 'santiago@banco.test', { handledBy: 'human_queue', useCase: null }),
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
  say('c-waiting', 'customer', 'Mira ![](https://tracker.test/px.png) y [aquí](https://phishing.test/login)');
  say('c-assistant', 'ai_agent', 'Tus tarjetas activas:\n\n- Terminada en **1070**\n- Terminada en 6262');

  const requested: string[] = [];
  await page.route('**/api/advisor/users', (route) =>
    role === 'admin'
      ? route.fulfill({
          json: { users: chats.map((c) => ({ userId: c.userId, userEmail: c.userEmail })) },
        })
      : route.fulfill({ status: 403, json: { code: 'forbidden:chat' } }),
  );
  await page.route('**/api/advisor/conversations**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requested.push(url.pathname + url.search);
    const [, , , , id, action] = url.pathname.split('/');
    const target = chats.find((c) => c.id === id);
    const body = request.postDataJSON() ?? {};

    if (id === 'counts') {
      const open = chats.filter((c) => !c.closedAt);
      // The inbox counts only the cases that need a person.
      const human = open.filter((c) => c.handledBy !== 'ai_agent');
      const byUseCase: Record<string, number> = {};
      for (const c of human) if (c.useCase) byUseCase[c.useCase] = (byUseCase[c.useCase] ?? 0) + 1;
      return route.fulfill({
        json: {
          total: human.length,
          aiAgent: open.length - human.length,
          byUseCase,
          withoutUseCase: human.filter((c) => !c.useCase).length,
          unattended: open.filter((c) => c.handledBy === 'human_queue').length,
          mine: open.filter((c) => c.assignedTo === me).length,
          resolved: chats.length - open.length,
        },
      });
    }
    if (!id) {
      const q = url.searchParams;
      const list = chats.filter(
        (c) =>
          (!q.get('status') || (q.get('status') === 'closed' ? !!c.closedAt : !c.closedAt)) &&
          (!q.get('userId') || c.userId === q.get('userId')) &&
          (!q.get('useCase') || c.useCase === q.get('useCase')) &&
          (q.get('handledBy')
            ? c.handledBy === q.get('handledBy')
            : q.get('status') === 'closed' || c.handledBy !== 'ai_agent') &&
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
      if (id === 'c-race' || heldByOther) {
        return route.fulfill({
          status: 409,
          json: { code: 'conflict:chat', assignedTo: id === 'c-race' ? OTHER : target.assignedTo },
        });
      }
      Object.assign(target, { handledBy: 'human_agent', assignedTo: me, assignedAt: now(), closedAt: null });
      say(id, 'system', 'Te atiende un asesor.');
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
  const requested = await mockAdvisorApi(page, email, role);
  await page.goto('/conversations');
  return requested;
}

const rows = (page: Page) => page.locator('[data-testid^="conversation-row-"]');
// The header shows state only when the chat needs attention or changed hands.
const headerStatus = (page: Page) => page.locator('header').getByTestId('attention');
const input = (page: Page) => page.getByLabel('Mensaje al cliente');

test.describe('Advisor console', () => {
  test('the inbox groups by use case and each view asks for its params', async ({ page }) => {
    const requested = await openConsole(page);
    await expect(page.getByTestId('inbox-title')).toHaveText('Bandeja');
    // Only the cases that need a person: David's own chat isn't here.
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('conversation-row-c-assistant')).toHaveCount(0);
    await expect(page.getByTestId('inbox-section-GENERAL_INQUIRY')).toBeVisible();
    await expect(page.getByTestId('use-case-chip-GENERAL_INQUIRY')).toHaveText('Consultas generales');
    await expect(page.getByTestId('inbox-section-OTHER').getByTestId('conversation-row-c-race')).toBeVisible();

    await page.getByTestId('view-waiting').click();
    await expect(rows(page)).toHaveCount(2);
    expect(requested.some((u) => u.includes('handledBy=human_queue'))).toBe(true);

    await page.getByTestId('view-resolved').click();
    await expect(rows(page)).toHaveCount(1);
    expect(requested.some((u) => u.includes('status=closed'))).toBe(true);

    await page.getByTestId('view-use-case-GENERAL_INQUIRY').click();
    await expect(page.getByTestId('inbox-title')).toHaveText('Consultas generales');
    await expect(rows(page)).toHaveCount(2);
    expect(requested.some((u) => u.includes('useCase=GENERAL_INQUIRY'))).toBe(true);

    await page.getByTestId('view-david').click();
    await expect(page.getByTestId('inbox-title')).toHaveText('Con AI');
    await expect(page.getByTestId('view-david')).toContainText('Con AI');
    await expect(page.getByTestId('view-waiting')).toContainText('En espera');
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByTestId('conversation-row-c-assistant')).toBeVisible();
    expect(requested.some((u) => u.includes('handledBy=ai_agent') && u.includes('status=open'))).toBe(true);
  });

  test('the views show how many conversations they have', async ({ page }) => {
    await openConsole(page);
    await expect(page.getByTestId('view-inbox-count')).toHaveText('3');
    await expect(page.getByTestId('view-david-count')).toHaveText('1');
    await expect(page.getByTestId('view-waiting-count')).toHaveText('2');
    await expect(page.getByTestId('view-resolved-count')).toHaveText('1');
    await expect(page.getByTestId('view-use-case-GENERAL_INQUIRY-count')).toHaveText('2');
    // Zero hides the number.
    await expect(page.getByTestId('view-mine-count')).toHaveCount(0);
    await expect(page.getByTestId('view-use-case-COMPLAINT-count')).toHaveCount(0);

    // Taking a chat updates the counters.
    await page.getByTestId('view-david').click();
    await page.getByTestId('conversation-row-c-assistant').click();
    await page.getByTestId('assistant-switch').click();
    await expect(page.getByTestId('view-mine-count')).toHaveText('1');
  });

  test('opening a chat shows it beside the list, and X closes it', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('view-david').click();
    await page.getByTestId('conversation-row-c-assistant').click();
    await expect(page.getByTestId('customer-meta')).toBeVisible();
    await expect(rows(page)).toHaveCount(1);
    await page.getByTestId('close-conversation').click();
    await expect(page.getByTestId('customer-meta')).toHaveCount(0);
  });

  test('turning the assistant off takes the chat and lets the advisor reply', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('view-david').click();
    await page.getByTestId('conversation-row-c-assistant').click();
    await expect(input(page)).toBeDisabled();

    await page.getByTestId('assistant-switch').click();
    await expect(headerStatus(page)).toHaveText('Con asesor · la atiendes tú');
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
    await expect(headerStatus(page)).toHaveText('Con asesor · la atiendes tú');

    await page.getByTestId('assistant-switch').click();
    await expect(headerStatus(page)).toHaveText('Con AI');
    await expect(input(page)).toBeDisabled();
    await expect(page.getByTestId('system-notice').last()).toContainText('Volviste con el asistente.');

    await page.getByTestId('assistant-switch').click();
    await page.getByTestId('resolve-button').click();
    await expect(headerStatus(page)).toHaveText('Resuelta');
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
    await expect(page.getByTestId('customer-meta')).toContainText(`Con asesor · ${OTHER}`);
    await expect(input(page)).toBeDisabled();
    await expect(page.getByTestId('force-take-button')).toHaveCount(0);
  });

  test('the admin supervises everything and attends like an advisor', async ({ page }) => {
    const requested = await openConsole(page, 'admin', 'root@example.com');
    await expect(page.getByTestId('nav-admin')).toHaveCount(0);
    await expect(page.getByTestId('inbox-title')).toHaveText('Bandeja');
    await expect(page.getByTestId('view-mine')).toBeVisible();
    await expect(rows(page)).toHaveCount(3);

    // Waiting: the admin takes it, replies and resolves it.
    await page.getByTestId('conversation-row-c-waiting').click();
    await expect(page.getByTestId('read-only-badge')).toHaveCount(0);
    await page.getByTestId('take-button').click();
    await expect(input(page)).toBeEnabled();
    await input(page).fill('Hola, soy el administrador.');
    await input(page).press('Enter');
    await expect(page.getByText('Hola, soy el administrador.')).toBeVisible();
    await page.getByTestId('view-mine').click();
    await expect(rows(page)).toHaveCount(1);
    await page.getByTestId('conversation-row-c-waiting').click();
    await page.getByTestId('resolve-button').click();
    await expect(page.getByTestId('customer-meta')).toContainText('Resuelta');

    // Held by another advisor: no controls, no force.
    await page.getByTestId('view-inbox').click();
    await page.getByTestId('user-filter').click();
    await page.getByTestId('user-option-c-other-user').click();
    await expect(rows(page)).toHaveCount(1);
    expect(requested.some((u) => u.includes('userId=c-other-user'))).toBe(true);
    await page.getByTestId('conversation-row-c-other').click();
    await expect(page.getByTestId('status-banner')).toContainText(`La atiende ${OTHER}`);
    for (const id of ['assistant-switch', 'take-button', 'resolve-button', 'force-take-button']) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
    await expect(input(page)).toBeDisabled();
  });

  test('shows David typing while a customer message has no reply', async ({ page }) => {
    await openConsole(page);
    // The customer just wrote to David and he hasn't answered yet.
    await page.route('**/api/advisor/conversations/c-assistant/messages**', (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      const after = new URL(route.request().url()).searchParams.get('after');
      return route.fulfill({
        json: after
          ? []
          : [
              {
                id: 'm-pending',
                chatId: 'c-assistant',
                role: 'user',
                parts: [{ type: 'text', text: '¿Cuál es mi saldo?' }],
                createdAt: new Date().toISOString(),
                senderType: 'customer',
                senderId: null,
              },
            ],
      });
    });
    await page.getByTestId('view-david').click();
    await page.getByTestId('conversation-row-c-assistant').click();
    await expect(page.getByTestId('bubble-customer').last()).toContainText('¿Cuál es mi saldo?');
    await expect(page.getByTestId('typing-indicator')).toBeVisible();

    // A resolved chat shows no indicator, even with the customer last.
    await page.getByTestId('view-resolved').click();
    await page.getByTestId('conversation-row-c-closed').click();
    await expect(page.getByTestId('bubble-customer').first()).toBeVisible();
    await expect(page.getByTestId('typing-indicator')).toHaveCount(0);
  });

  test('an empty inbox says how many chats David has and links to them', async ({ page }) => {
    await openConsole(page, 'admin', 'root@example.com');
    // Javier only talks to David: nothing in his inbox needs a person.
    await page.getByTestId('user-filter').click();
    await page.getByTestId('user-option-c-assistant-user').click();
    await expect(page.getByTestId('inbox-empty-david')).toContainText('No hay casos para atender.');
    await page.getByTestId('inbox-empty-david-link').click();
    await expect(page.getByTestId('inbox-title')).toHaveText('Con AI');
    await expect(page.getByTestId('conversation-row-c-assistant')).toBeVisible();
  });

  test('/admin now leads to Chats', async ({ page }) => {
    await mockSessionRole(page, 'admin', 'root@example.com');
    await mockAdvisorApi(page, 'root@example.com', 'admin');
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/conversations$/);
  });

  test('renders David\'s markdown: bullets and bold', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('view-david').click();
    await page.getByTestId('conversation-row-c-assistant').click();
    const reply = page.getByTestId('bubble-agent').last();
    await expect(reply.locator('li')).toHaveCount(2);
    const bold = reply.getByText('1070', { exact: true });
    await expect(bold).toBeVisible();
    expect(Number(await bold.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThanOrEqual(600);
    await expect(reply).not.toContainText('**');
    const bullet = await reply
      .locator('ul')
      .evaluate((el) => getComputedStyle(el).listStyleType);
    expect(bullet).toBe('disc');
  });

  test('rows: robot for David, text state only when it needs attention', async ({ page }) => {
    await openConsole(page);
    const assistantRow = page.getByTestId('conversation-row-c-assistant');
    const waitingRow = page.getByTestId('conversation-row-c-waiting');
    await expect(waitingRow.getByTestId('attention')).toHaveText('En espera');
    await expect(waitingRow.getByTestId('waiting-dot')).toBeVisible();
    await expect(waitingRow.getByTestId('row-text')).toHaveText('Es urgente, por favor');
    await expect(waitingRow.getByTestId('row-text')).toHaveAttribute('title', 'Consulta de daniela');
    await expect(waitingRow.getByTestId('david-icon')).toHaveCount(0);
    await expect(page.getByTestId('conversation-row-c-other').getByTestId('attention')).toHaveText('Con asesor · ada');
    await expect(page.locator('body')).not.toContainText('Sin caso de uso');

    await page.getByTestId('view-david').click();
    await expect(assistantRow.getByTestId('david-icon')).toHaveAttribute('title', 'Con AI: lo atiende David');
    await expect(assistantRow.getByTestId('attention')).toHaveCount(0);
    await expect(assistantRow.getByTestId('row-text')).toHaveText('Consulta de javier');
    await expect(page.locator('body')).not.toContainText('Con David');
  });

  test('customer text is shown literally: no images or links', async ({ page }) => {
    const external: string[] = [];
    await page.route('https://tracker.test/**', (route) => {
      external.push(route.request().url());
      return route.abort();
    });
    await openConsole(page);
    await page.getByTestId('conversation-row-c-waiting').click();
    const bubble = page.getByTestId('bubble-customer').last();
    await expect(bubble).toContainText('![](https://tracker.test/px.png)');
    await expect(bubble).toContainText('[aquí](https://phishing.test/login)');
    await expect(bubble.locator('img')).toHaveCount(0);
    await expect(bubble.locator('a')).toHaveCount(0);
    expect(external).toEqual([]);
  });

  test('a quick reply fills the message field', async ({ page }) => {
    await openConsole(page);
    await page.getByTestId('view-david').click();
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
