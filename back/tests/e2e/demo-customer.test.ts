import type { Page, Request } from '@playwright/test';

import { expect, test } from '../fixtures';
import { ChatPage } from '../pages/chat';

const CUSTOMERS = [
  { token: 'demo-mx-1', label: 'Santiago · México' },
  { token: 'demo-co-1', label: 'Javier · Colombia' },
  { token: 'demo-expired', label: 'Sesión vencida' },
];

// The customer list comes from the agent's demo data, so the browser gets a
// fixed one; what the front sends is read from the POST /api/chat body.
async function mockCustomers(page: Page, ok = true) {
  await page.route('**/api/demo-customers', (route) =>
    ok
      ? route.fulfill({ json: { customers: CUSTOMERS } })
      : route.fulfill({ status: 500, json: { error: 'boom' } }),
  );
}

function nextChatRequest(page: Page): Promise<Request> {
  return page.waitForRequest(
    (req) => req.method() === 'POST' && new URL(req.url()).pathname === '/api/chat',
  );
}

// Tests share the worker's authenticated context (and its localStorage), so
// they run in order and each opens its own page.
test.describe.configure({ mode: 'serial' });

test.describe('Demo customer selector', () => {
  let page: Page;
  let chat: ChatPage;

  test.beforeEach(async ({ adaContext }) => {
    page = await adaContext.context.newPage();
    chat = new ChatPage(page);
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('lists the customers and sends the picked token', async () => {
    await mockCustomers(page);
    await chat.createNewChat();
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await expect(chat.demoCustomerSelector).toContainText('Cliente demo: Santiago · México');
    await chat.demoCustomerSelector.hover();
    await expect(page.getByTestId('demo-customer-hint').first()).toContainText(
      'Elige qué cliente del banco simular en esta demo',
    );
    await chat.selectDemoCustomer('demo-co-1');
    await expect(chat.demoCustomerSelector).toContainText('Javier · Colombia');

    const request = nextChatRequest(page);
    await chat.sendUserMessage('¿Cuál es mi saldo?');
    expect((await request).postDataJSON().sessionToken).toBe('demo-co-1');

    await expect(chat.demoCustomerSelector).toBeDisabled();
  });

  test('keeps the token after reloading the chat', async () => {
    // Reopening a chat needs the database; ephemeral mode keeps no chats.
    test.skip(
      process.env.TEST_MODE === 'ephemeral',
      'needs a database to reopen the chat',
    );
    await mockCustomers(page);
    await chat.createNewChat();
    const first = nextChatRequest(page);
    await chat.sendUserMessage('Hola');
    const chatId = (await first).postDataJSON().id;

    await page.goto(`/chat/${chatId}`);
    await expect(chat.demoCustomerSelector).toBeDisabled();
    const second = nextChatRequest(page);
    await chat.sendUserMessage('¿Sigues ahí?');
    expect((await second).postDataJSON().sessionToken).toBe('demo-co-1');
  });

  test('a new chat starts with the last customer picked', async () => {
    await mockCustomers(page);
    await chat.createNewChat();
    await expect(chat.demoCustomerSelector).toContainText('Javier · Colombia');
    await expect(chat.demoCustomerSelector).toBeEnabled();
  });

  test('without the customer list there is no selector and no token', async () => {
    await mockCustomers(page, false);
    await chat.createNewChat();
    await expect(chat.multimodalInput).toBeVisible();
    await expect(chat.demoCustomerSelector).toHaveCount(0);

    const request = nextChatRequest(page);
    await chat.sendUserMessage('Hola');
    expect((await request).postDataJSON()).not.toHaveProperty('sessionToken');
  });
});
