import { expect, test } from '@playwright/test';
import { parseRetention } from '../../server/src/analytics-data';
import evidence from '../../../ml/reports/2026-10-05/admin_analytics_data.json';

// Aggregate evidence is real; every individual reference below is a local UI fixture.
const data = parseRetention(
  evidence.queries.find((q) => q.label === 'retention_dashboard')!
    .rows as Record<string, string | null>[],
);
data.customers = Array.from({ length: 18 }, (_, i) => ({
  ref: i.toString(16).padStart(12, '0'),
  country: i < 15 ? 'México' : 'Colombia',
  segment: 'Basic',
  band: 'high' as const,
  signals: ['inactive', 'unresolved', 'low_csat'],
  inactiveDays: 65,
  tx30: 0,
  txPrevious30: 4,
  openCases: 2,
  csat: 1.5,
  csatResponses: 2,
  families: 3,
}));
const source = {
  provider: 'databricks_sql',
  tables: ['workspace.bank_gold.customer_360'],
  status: 'fresh',
  updating: false,
  updatedAt: '2026-10-05T16:00:00Z',
  lastAttemptAt: '2026-10-05T16:00:00Z',
  lastRefreshFailed: false,
  cacheSeconds: 600,
  statementId: 'local-ui-fixture',
  durationMs: 50,
};
test('retention uses cached filters, supports responsive views and preserves stale results', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  let fail = false;
  let role = 'admin',
    reads = 0;
  let body: any = { data, source };
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session')
      return route.fulfill({
        json: {
          user: { email: 'test@invalid.example', name: 'Test', role },
          authMode: 'databricks',
        },
      });
    if (path === '/api/config')
      return route.fulfill({ json: { features: { chatHistory: true } } });
    if (path === '/api/demo-customers')
      return route.fulfill({ json: { customers: [] } });
    if (path === '/api/advisor/retention-dashboard') {
      reads++;
      if (fail)
        return route.fulfill({
          status: 503,
          json: { error: 'Explicit local fixture' },
        });
      return route.fulfill({ json: body });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto('/retention');
  await expect(page.getByTestId('retention-overview')).toBeVisible();
  await expect(page.getByTestId('nav-retention')).toBeVisible();
  await expect(
    page.locator('summary').filter({ hasText: 'Cliente ·' }),
  ).toHaveCount(15);
  const requestsBefore = reads;
  await page
    .getByRole('group', { name: 'País', exact: true })
    .getByRole('button', { name: 'Colombia', exact: true })
    .click();
  await expect(
    page.locator('summary').filter({ hasText: 'Cliente ·' }),
  ).toHaveCount(3);
  await page
    .getByRole('group', { name: 'Prioridad', exact: true })
    .getByRole('button', { name: 'Prioridad media', exact: true })
    .click();
  await expect(
    page.getByText('No hay clientes en esta selección.'),
  ).toBeVisible();
  expect(reads).toBe(requestsBefore);
  await page
    .getByRole('group', { name: 'Prioridad', exact: true })
    .getByRole('button', { name: 'Alta prioridad', exact: true })
    .click();
  await page
    .locator('summary')
    .filter({ hasText: 'Cliente ·' })
    .first()
    .click();
  await expect(
    page.getByText('CSAT observado', { exact: true }).first(),
  ).toBeVisible();
  for (const width of [375, 414, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByTestId('retention-dashboard').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: '/tmp/retention-dashboard-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.screenshot({
    path: '/tmp/retention-dashboard-mobile.png',
    fullPage: true,
  });
  fail = true;
  await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
  await expect(
    page.getByText('Falló la actualización de la pantalla;', { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId('retention-overview')).toBeVisible();
  fail = false;
  body = {
    data,
    source: { ...source, status: 'stale', lastRefreshFailed: true },
  };
  await page.reload();
  await expect(
    page.getByText('No se pudo actualizar la consulta.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByTestId('retention-overview')).toBeVisible();
  body = {
    data: null,
    source: {
      ...source,
      updatedAt: null,
      statementId: null,
      status: 'loading',
      updating: true,
    },
  };
  await page.reload();
  await expect(
    page.getByText('Preparando la consulta de retención en segundo plano…'),
  ).toBeVisible();
  await expect(page.getByTestId('retention-overview')).toHaveCount(0);
  body = {
    data: null,
    source: {
      ...source,
      updatedAt: null,
      statementId: null,
      status: 'unavailable',
      lastRefreshFailed: true,
    },
  };
  await page.reload();
  await expect(
    page.getByText('No hay un resultado disponible.', { exact: false }),
  ).toBeVisible();
  body = { data, source };
  await page.evaluate(() => localStorage.setItem('ui:lang', 'pt'));
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Retenção de clientes', exact: true }),
  ).toBeVisible();
  for (role of ['advisor', 'customer']) {
    await page.reload();
    await expect(page.getByTestId('no-access')).toBeVisible();
    await expect(page.getByTestId('nav-retention')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
