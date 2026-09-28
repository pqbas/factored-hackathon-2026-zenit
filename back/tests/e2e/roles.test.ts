import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';
import { mockSessionRole, type Role } from '../session-role';

const SECTIONS = ['nav-agent', 'nav-products', 'nav-chats'] as const;

async function expectRail(page: Page, visible: (typeof SECTIONS)[number][]) {
  await expect(page.getByTestId('nav-agent')).toBeVisible();
  for (const id of SECTIONS) {
    await expect(page.getByTestId(id)).toHaveCount(visible.includes(id) ? 1 : 0);
  }
}

test.describe('Navigation by role', () => {
  const cases: {
    role: Role | null;
    rail: (typeof SECTIONS)[number][];
    blocked: string | null;
  }[] = [
    { role: 'customer', rail: ['nav-agent', 'nav-products'], blocked: '/conversations' },
    { role: 'advisor', rail: ['nav-agent', 'nav-chats'], blocked: '/products' },
    { role: 'admin', rail: ['nav-agent', 'nav-products', 'nav-chats'], blocked: null },
    // No role in the session: treated as customer, never as admin.
    { role: null, rail: ['nav-agent', 'nav-products'], blocked: '/conversations' },
  ];

  for (const { role, rail, blocked } of cases) {
    test(`${role ?? 'no role'} sees only its sections`, async ({ page }) => {
      await mockSessionRole(page, role);
      await page.goto('/products');
      await expectRail(page, rail);

      if (blocked) {
        await page.goto(blocked);
        await expect(page.getByTestId('no-access')).toBeVisible();
        await page.getByRole('link', { name: 'Ir al asistente' }).click();
        await expect(page).toHaveURL(/\/$/);
      } else {
        for (const path of ['/products', '/conversations']) {
          await page.goto(path);
          await expect(page.getByTestId('nav-agent')).toBeVisible();
          await expect(page.getByTestId('no-access')).toHaveCount(0);
        }
      }
    });
  }
});
