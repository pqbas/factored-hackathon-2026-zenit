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
    // Cards only: their movements show under the selected card, once.
    await expect(page.getByTestId('overview-movements')).toHaveCount(0);
    await expect(page.getByTestId('transaction-row')).toHaveCount(1);
    expect(tokens).toContain('demo-mx-1');
  });

  test('the accounts section lists only the savings movements', async ({ page }) => {
    const withSavings = {
      ...PRODUCTS,
      products: [
        ...PRODUCTS.products,
        { productType: 'Cuenta Ahorro', last4: '5500', currency: 'USD', currentBalance: 2500, creditLimit: null, availableCredit: null },
      ],
      transactions: [
        ...PRODUCTS.transactions,
        { date: '2026-09-26T10:00:00.000Z', productType: 'Cuenta Ahorro', last4: '5500', type: 'Deposit', merchant: null, amount: 300, currency: 'USD', status: 'Approved' },
      ],
    };
    await mockProducts(page, () => ({ status: 200, json: withSavings }));
    await page.goto('/products');
    const section = page.getByTestId('overview-movements');
    await expect(section).toContainText('Movimientos de tus cuentas');
    await expect(section.getByTestId('transaction-row')).toHaveCount(1);
    await expect(section).toContainText('Cuenta Ahorro');
    await expect(section).not.toContainText('Supermercado');
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

  test('the cards show as a carousel with the selected card\'s detail', async ({ page }) => {
    await mockProducts(page, () => ({ status: 200, json: PRODUCTS }));
    await page.goto('/products');
    const carousel = page.getByTestId('card-carousel');
    await expect(carousel.getByTestId('card-visual-1070')).toContainText('•••• •••• •••• 1070');
    await expect(carousel.getByTestId('card-visual-6262')).toBeVisible();
    await expect(carousel.getByTestId('card-dot-1')).toBeVisible();
    // Only the last 4 digits exist: nothing that looks like a full number.
    await expect(carousel).not.toContainText(/\d{4} \d{4}/);

    const detail = page.getByTestId('card-detail');
    await expect(detail).toContainText('Supermercado');
    await carousel.getByTestId('card-dot-1').click();
    await expect(carousel.getByTestId('card-visual-6262')).toHaveAttribute('aria-pressed', 'true');
    await expect(detail).not.toContainText('Supermercado');

    // No per-card actions: the chat covers them.
    await expect(page.locator('[data-testid^="card-action-"]')).toHaveCount(0);
  });

  test('savings show their estimated evolution per currency', async ({ page }) => {
    const withSavings = {
      ...PRODUCTS,
      products: [
        ...PRODUCTS.products,
        { productType: 'Cuenta Ahorro', last4: '5500', currency: 'USD', currentBalance: 2500, creditLimit: null, availableCredit: null },
        { productType: 'Cuenta Ahorro', last4: '7700', currency: 'MXN', currentBalance: 900, creditLimit: null, availableCredit: null },
      ],
    };
    await mockProducts(page, () => ({ status: 200, json: withSavings }));
    const months = Array.from({ length: 12 }, (_, i) => `2025-${String(10 + i).padStart(2, '0')}`).map((m, i) =>
      i < 3 ? m : `2026-${String(i - 2).padStart(2, '0')}`,
    );
    await page.route('**/api/products/savings-history**', (route) =>
      route.fulfill({
        json: {
          estimated: true,
          // MXN went negative when rebuilt: no series for it.
          series: [{ currency: 'USD', current: 2500, points: months.map((month, i) => ({ month, balance: i < 7 ? 16000 : 2500 })) }],
        },
      }),
    );
    await page.goto('/products');
    const section = page.getByTestId('savings-evolution');
    await expect(section).toContainText('Evolución de tus ahorros');
    await expect(section.getByTestId('savings-estimated')).toHaveText('Saldo estimado a partir de tus movimientos');
    await expect(section.getByTestId('savings-chart-USD').locator('[data-testid^="savings-point-"]')).toHaveCount(12);
    await expect(section.getByTestId('savings-chart-USD')).toContainText('$2,500.00');
    await expect(section.getByTestId('savings-current-MXN')).toContainText('Sin estimación del historial');
  });

  test('without the savings history the page still works', async ({ page }) => {
    const withSavings = {
      ...PRODUCTS,
      products: [
        ...PRODUCTS.products,
        { productType: 'Cuenta Ahorro', last4: '5500', currency: 'USD', currentBalance: 2500, creditLimit: null, availableCredit: null },
      ],
    };
    await mockProducts(page, () => ({ status: 200, json: withSavings }));
    await page.route('**/api/products/savings-history**', (route) => route.fulfill({ status: 502, json: {} }));
    await page.goto('/products');
    await expect(page.getByText('Hola, Santiago')).toBeVisible();
    await expect(page.getByTestId('card-carousel')).toBeVisible();
    await expect(page.getByTestId('savings-evolution')).toHaveCount(0);
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
