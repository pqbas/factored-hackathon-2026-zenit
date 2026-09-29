import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';
import { mockSessionRole } from '../session-role';

// /products reads GET /api/products for the demo customer picked in the chat;
// the bank's warehouse isn't reachable from tests, so the browser gets it mocked.
const PRODUCTS = {
  customer: { customerId: 'CUS1', firstName: 'Santiago', lastName: 'Contreras López' },
  products: [
    { productType: 'Tarjeta Crédito', last4: '1070', currency: 'USD', currentBalance: 3332.62, creditLimit: 8672.72, availableCredit: 5340.1 },
    { productType: 'Tarjeta Crédito', last4: '6262', currency: 'USD', currentBalance: 708.41, creditLimit: 24881.06, availableCredit: 24172.65 },
  ],
  transactions: [
    { date: '2026-09-28T10:00:00.000Z', productType: 'Tarjeta Crédito', last4: '1070', type: 'Purchase', merchant: 'Supermercado', amount: 45.5, currency: 'USD', status: 'Approved' },
    { date: '2026-09-27T10:00:00.000Z', productType: 'Tarjeta Crédito', last4: '6262', type: 'Payment', merchant: null, amount: 100, currency: 'USD', status: 'Approved' },
  ],
};

async function mockProducts(page: Page, answer: (token: string) => { status: number; json?: unknown }) {
  const tokens: string[] = [];
  await page.route('**/api/demo-customers', (route) =>
    route.fulfill({
      json: {
        customers: [
          { token: 'demo-mx-1', label: 'Santiago · México' },
          { token: 'demo-expired', label: 'Sesión vencida' },
        ],
      },
    }),
  );
  await page.route('**/api/products**', (route) => {
    const token = new URL(route.request().url()).searchParams.get('sessionToken') ?? '';
    tokens.push(token);
    const { status, json } = answer(token);
    return route.fulfill({ status, json });
  });
  return tokens;
}

test.describe('Mis productos', () => {
  test.beforeEach(async ({ page }) => {
    // Admin sees both Mis productos and Chats, which the last test switches between.
    await mockSessionRole(page, 'admin');
    await page.addInitScript(() => localStorage.setItem('demo-customer:last', 'demo-mx-1'));
  });

  test('shows the customer, their products and latest movements', async ({ page }) => {
    const tokens = await mockProducts(page, () => ({ status: 200, json: PRODUCTS }));
    await page.goto('/products');
    await expect(page.getByText('Hola, Santiago')).toBeVisible();
    await expect(page.getByTestId('customer-profile')).toContainText('Contreras López');
    await expect(page.locator('[data-testid^="product-row-"]:not([data-testid="product-row-summary"])')).toHaveCount(2);
    await expect(page.getByTestId('transaction-row')).toHaveCount(2);
    expect(tokens).toContain('demo-mx-1');
  });

  test('a card shows its limit usage and its own movements', async ({ page }) => {
    await mockProducts(page, () => ({ status: 200, json: PRODUCTS }));
    await page.goto('/products');
    await page.getByTestId('product-row-1070').click();
    const detail = page.getByTestId('product-detail');
    await expect(detail).toContainText('Tarjeta Crédito');
    await expect(detail).toContainText('de tu límite');
    await expect(detail.getByTestId('transaction-row')).toHaveCount(1);
  });

  test('an expired demo customer says so', async ({ page }) => {
    await mockProducts(page, (token) =>
      token === 'demo-expired'
        ? { status: 401, json: { code: 'unauthorized:chat', reason: 'expired' } }
        : { status: 200, json: PRODUCTS },
    );
    await page.goto('/products');
    await expect(page.getByTestId('demo-customer-selector')).toContainText('Cliente demo:');
    await page.getByTestId('demo-customer-selector').click();
    await page.getByTestId('demo-customer-option-demo-expired').click();
    await expect(page.getByTestId('products-session-error')).toContainText('venció');
  });

  test('a warehouse failure offers a retry', async ({ page }) => {
    let calls = 0;
    await mockProducts(page, () => (++calls === 1 ? { status: 502, json: {} } : { status: 200, json: PRODUCTS }));
    await page.goto('/products');
    await expect(page.getByTestId('products-error')).toBeVisible();
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByText('Hola, Santiago')).toBeVisible();
  });

  test('the nav rail opens the section', async ({ page }) => {
    await mockProducts(page, () => ({ status: 200, json: PRODUCTS }));
    await page.goto('/conversations');
    await page.getByTestId('nav-products').click();
    await expect(page).toHaveURL(/\/products$/);
  });
});
