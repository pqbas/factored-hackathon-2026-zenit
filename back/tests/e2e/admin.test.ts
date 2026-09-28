import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';
import { mockSessionRole } from '../session-role';

// Ephemeral test runs have no database (the admin API answers 204), so the
// admin API is mocked in the browser.
const chat = (id: string, title: string, userId: string, userEmail: string | null) => ({
  id,
  title,
  userId,
  userEmail,
  createdAt: '2026-09-28T10:00:00.000Z',
  visibility: 'private',
});

const PAGE_1 = [
  chat('c1', 'Consulta de saldo', 'u1', 'ana@banco.test'),
  chat('c2', 'Chat antiguo', 'u2', null),
];
const PAGE_2 = [chat('c3', 'Aumento de límite', 'u1', 'ana@banco.test')];
const USERS = [
  { userId: 'u1', userEmail: 'ana@banco.test' },
  { userId: 'u2', userEmail: null },
];
const MESSAGES = [
  {
    id: 'm1',
    chatId: 'c1',
    role: 'user',
    parts: [
      {
        type: 'text',
        text: '¿Cuál es mi saldo? ![](https://tracker.test/px.png) [aquí](https://phishing.test/login)',
      },
    ],
    attachments: [],
    createdAt: '2026-09-28T10:00:00.000Z',
  },
  {
    id: 'm2',
    chatId: 'c1',
    role: 'assistant',
    parts: [{ type: 'text', text: 'Tu saldo es de $100.' }],
    attachments: [],
    createdAt: '2026-09-28T10:00:05.000Z',
  },
];

async function mockAdminApi(page: Page, status?: 403 | 204) {
  const requested: string[] = [];
  await page.route('**/api/admin/**', (route) => {
    const url = new URL(route.request().url());
    requested.push(url.pathname + url.search);
    if (status === 403) {
      return route.fulfill({ status: 403, json: { code: 'forbidden:chat' } });
    }
    if (status === 204) return route.fulfill({ status: 204 });
    if (url.pathname === '/api/admin/users') {
      return route.fulfill({ json: { users: USERS } });
    }
    if (url.pathname.endsWith('/messages')) {
      return route.fulfill({ json: MESSAGES });
    }
    const userId = url.searchParams.get('userId');
    if (userId) {
      const chats = [...PAGE_1, ...PAGE_2].filter((c) => c.userId === userId);
      return route.fulfill({ json: { chats, hasMore: false } });
    }
    const second = url.searchParams.get('ending_before') === 'c2';
    return route.fulfill({
      json: second ? { chats: PAGE_2, hasMore: false } : { chats: PAGE_1, hasMore: true },
    });
  });
  return requested;
}

const rows = (page: Page) => page.locator('[data-testid^="admin-chat-row-"]');

test.describe('Admin view', () => {
  test('lists every user conversation, with "Sin email" when missing', async ({ page }) => {
    await mockSessionRole(page, 'admin');
    await mockAdminApi(page);
    await page.goto('/admin');

    await expect(rows(page)).toHaveCount(2);
    await expect(page.getByTestId('admin-chat-row-c1')).toContainText('ana@banco.test');
    await expect(page.getByTestId('admin-chat-row-c2')).toContainText('Sin email');
  });

  test('loads the next page', async ({ page }) => {
    await mockSessionRole(page, 'admin');
    await mockAdminApi(page);
    await page.goto('/admin');

    await page.getByTestId('admin-load-more').click();
    await expect(rows(page)).toHaveCount(3);
    await expect(page.getByTestId('admin-load-more')).toHaveCount(0);
  });

  test('filters by user', async ({ page }) => {
    await mockSessionRole(page, 'admin');
    const requested = await mockAdminApi(page);
    await page.goto('/admin');

    await page.getByTestId('admin-user-filter').click();
    await page.getByTestId('admin-user-option-u2').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(page.getByTestId('admin-chat-row-c2')).toBeVisible();
    expect(requested.some((u) => u.includes('userId=u2'))).toBe(true);
  });

  test('opens a conversation read-only', async ({ page }) => {
    await mockSessionRole(page, 'admin');
    await mockAdminApi(page);
    await page.goto('/admin');

    await page.getByTestId('admin-chat-row-c1').click();
    await expect(page.getByTestId('admin-message')).toHaveCount(2);
    await expect(page.getByTestId('admin-message').last()).toContainText('$100');
    // The customer's text is literal: no image loads, no link.
    const customer = page.locator('[data-testid="admin-message"][data-role="user"]');
    await expect(customer).toContainText('![](https://tracker.test/px.png)');
    await expect(customer.locator('img')).toHaveCount(0);
    await expect(customer.locator('a')).toHaveCount(0);
    await expect(page.getByRole('textbox')).toHaveCount(0);
  });

  test('a 403 from the back shows no access', async ({ page }) => {
    await mockSessionRole(page, 'admin');
    await mockAdminApi(page, 403);
    await page.goto('/admin');
    await expect(page.getByTestId('no-access')).toBeVisible();
  });

  test('without a database it says so', async ({ page }) => {
    await mockSessionRole(page, 'admin');
    await mockAdminApi(page, 204);
    await page.goto('/admin');
    await expect(page.getByTestId('admin-no-database')).toBeVisible();
  });
});
