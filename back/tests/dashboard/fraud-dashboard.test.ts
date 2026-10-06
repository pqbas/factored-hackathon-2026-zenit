import { expect, test } from '@playwright/test';
import snapshot from '../../server/src/data/fraud-dashboard.json';

const zero = {
  status: 'available',
  total: 0,
  scored: 0,
  alerts: 0,
  unavailable: 0,
  open: 0,
  closed: 0,
  byDay: [],
  byType: [],
  scoreBins: Array.from({ length: 10 }, (_, bin) => ({ bin, total: 0 })),
};
const fixture = {
  ...zero,
  total: 5,
  scored: 3,
  alerts: 1,
  unavailable: 2,
  open: 4,
  closed: 1,
  byDay: [{ day: '2026-10-05', total: 5, scored: 3, alerts: 1 }],
  byType: [
    { type: 'not_recognized', total: 3 },
    { type: 'duplicate_charge', total: 2 },
  ],
  scoreBins: zero.scoreBins.map((b) => ({
    ...b,
    total: b.bin === 0 ? 2 : b.bin === 1 ? 1 : 0,
  })),
};

test('admin filters, model evidence, empty/unavailable/error states and responsive layout', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let operational: object = fixture;
  let fail = false;
  let role = 'admin';
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    let body: object = {};
    if (url.pathname === '/api/session')
      body = {
        user: { email: 'test@invalid.example', name: 'Test', role },
        authMode: 'databricks',
      };
    if (url.pathname === '/api/config')
      body = { features: { chatHistory: true } };
    if (url.pathname === '/api/demo-customers') body = { customers: [] };
    if (url.pathname === '/api/advisor/fraud-dashboard') {
      if (fail)
        return route.fulfill({
          status: 503,
          json: { error: 'Explicit local fixture' },
        });
      body = {
        snapshot,
        operational,
        window: Object.fromEntries(url.searchParams),
        refreshedAt: '2026-10-05T15:00:00Z',
      };
    }
    return route.fulfill({ json: body });
  });
  await page.goto('/fraud');
  await expect(page.getByTestId('fraud-overview')).toBeVisible();
  await expect(page.getByTestId('nav-fraud')).toBeVisible();
  await page.getByRole('button', { name: 'Canal', exact: true }).click();
  await expect(page.getByText('POS', { exact: true })).toBeVisible();
  await page
    .getByRole('button', { name: 'Tasa de etiquetas', exact: true })
    .click();
  for (const width of [375, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const tab of ['overview', 'operations', 'model']) {
      await page.getByTestId(`fraud-tab-${tab}`).click();
      await expect(
        page.getByTestId(`fraud-${tab === 'operations' ? 'operation' : tab}`),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
  await expect(page.getByText('0.0831%', { exact: true })).toHaveCount(2);
  await page.getByTestId('fraud-tab-operations').click();
  await expect(page.getByText('60.0%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hoy', exact: true }).click();
  await expect(page.getByText('60.0%', { exact: true })).toBeVisible();
  for (const status of ['available', 'unavailable', 'error']) {
    operational = { ...zero, status };
    await page.reload();
    await page.getByTestId('fraud-tab-operations').click();
    if (status === 'available')
      await expect(
        page.getByText('Todavía no hay reclamos en este período.'),
      ).toBeVisible();
    else
      await expect(
        page.getByText('Cobertura de predicción', { exact: true }),
      ).toHaveCount(0);
  }
  fail = true;
  await page.reload();
  await expect(page.getByText('No pudimos cargar el dashboard.')).toBeVisible();
  fail = false;
  operational = fixture;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByTestId('fraud-overview')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('ui:lang', 'pt'));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Inteligência de fraude', exact: true }),
  ).toBeVisible();
  for (role of ['advisor', 'customer']) {
    await page.reload();
    await expect(page.getByTestId('no-access')).toBeVisible();
    await expect(page.getByTestId('nav-fraud')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
