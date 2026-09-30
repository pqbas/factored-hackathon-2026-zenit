import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';
import { mockSessionRole } from '../session-role';

// GET /api/advisor/metrics (docs/flujo-atencion.md §6) served in the browser,
// following the back's contract.
const METRICS = {
  total: 10,
  aiContained: 6,
  human: 3,
  assisted: 1,
  byUseCase: {
    GENERAL_INQUIRY: { total: 5, aiContained: 4, human: 1, assisted: 0 },
    COMPLAINT: { total: 3, aiContained: 0, human: 2, assisted: 1 },
    NONE: { total: 2, aiContained: 2, human: 0, assisted: 0 },
  },
};

async function mockMetrics(page: Page, answer: () => { status: number; json?: unknown }) {
  const requested: URL[] = [];
  await page.route('**/api/advisor/metrics**', (route) => {
    const url = new URL(route.request().url());
    requested.push(url);
    const to = url.searchParams.get('to') ?? '';
    const { status, json } = answer();
    // The back only sends days with events: here, just the last one.
    const body =
      json && typeof json === 'object'
        ? { ...json, byDay: [{ day: to, total: 10, aiContained: 6, human: 3, assisted: 1 }] }
        : json;
    return route.fulfill({ status, json: body });
  });
  return requested;
}

test.describe('Métricas', () => {
  test.beforeEach(async ({ page }) => {
    await mockSessionRole(page, 'admin', 'root@example.com');
  });

  test('shows KPIs, use cases and the daily trend for the picked range', async ({ page }) => {
    const requested = await mockMetrics(page, () => ({ status: 200, json: METRICS }));
    await page.goto('/');
    await page.getByTestId('nav-metrics').click();
    await expect(page).toHaveURL(/\/metrics$/);

    await expect(page.getByTestId('kpi-containment-value')).toHaveText('60%');
    await expect(page.getByTestId('kpi-containment')).toContainText('6 de 10 resoluciones');
    await expect(page.getByTestId('kpi-aiContained-value')).toHaveText('6');
    await expect(page.getByTestId('kpi-human-value')).toHaveText('3');
    await expect(page.getByTestId('kpi-assisted-value')).toHaveText('1');

    // Largest first; NONE goes under Otras.
    const general = page.getByTestId('metrics-use-case-GENERAL_INQUIRY');
    await expect(general.getByTestId('use-case-total')).toHaveText('5');
    await expect(general.getByTestId('use-case-pct')).toHaveText('80%');
    await expect(page.getByTestId('metrics-use-case-OTHER')).toContainText('Otras');
    await expect(page.getByTestId('metrics-use-case-COMPLAINT').getByTestId('use-case-pct')).toHaveText('0%');

    // 7 days by default, days without events included.
    await expect(page.locator('[data-testid^="metrics-day-"]')).toHaveCount(7);
    const week = requested.at(-1);
    expect(week?.searchParams.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await page.getByTestId('metrics-range-month').click();
    await expect(page.locator('[data-testid^="metrics-day-"]')).toHaveCount(30);
    await page.getByTestId('metrics-range-today').click();
    await expect(page.getByTestId('metrics-trend-single')).toBeVisible();
    const today = requested.at(-1);
    expect(today?.searchParams.get('from')).toBe(today?.searchParams.get('to'));
  });

  test('the language button shows the metrics in Portuguese', async ({ page }) => {
    await mockMetrics(page, () => ({ status: 200, json: METRICS }));
    await page.goto('/metrics');
    await expect(page.getByRole('heading', { name: 'Métricas de resolución' })).toBeVisible();
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByRole('heading', { name: 'Métricas de resolução' })).toBeVisible();
    await expect(page.getByTestId('nav-metrics')).toHaveAttribute('aria-label', 'Métricas');
    // Numbers and data stay as they come.
    await expect(page.getByTestId('kpi-containment-value')).toHaveText('60%');
  });

  test('without resolutions it says so', async ({ page }) => {
    await mockMetrics(page, () => ({ status: 204 }));
    await page.goto('/metrics');
    await expect(page.getByTestId('metrics-empty')).toContainText('Todavía no hay resoluciones');
  });

  test('a failure offers a retry', async ({ page }) => {
    let fail = true;
    await mockMetrics(page, () => (fail ? { status: 500, json: {} } : { status: 200, json: METRICS }));
    await page.goto('/metrics');
    await expect(page.getByTestId('metrics-error')).toBeVisible();
    fail = false;
    await page.getByRole('button', { name: 'Reintentar' }).click();
    await expect(page.getByTestId('kpi-containment-value')).toHaveText('60%');
  });

  test.describe('in Lima (UTC-5)', () => {
    test.use({ timezoneId: 'America/Lima' });

    test('a closure at 22:30 counts on the local day', async ({ page }) => {
      // 22:30 on the 28th in Lima = 03:30 UTC on the 29th.
      await page.clock.setFixedTime(new Date('2026-09-29T03:30:00.000Z'));
      const requested = await mockMetrics(page, () => ({ status: 200, json: METRICS }));
      await page.goto('/metrics');
      await page.getByTestId('metrics-range-today').click();
      await expect(page.getByTestId('metrics-range-caption')).toHaveText('Hoy, 28 de septiembre');
      await expect(page.getByTestId('kpi-containment-value')).toHaveText('60%');
      const today = requested.at(-1);
      expect(today?.searchParams.get('from')).toBe('2026-09-28');
      expect(today?.searchParams.get('to')).toBe('2026-09-28');
      expect(today?.searchParams.get('tz')).toBe('America/Lima');

      // The week ends on the local 28th, with that day's bar.
      await page.getByTestId('metrics-range-week').click();
      await expect(page.getByTestId('metrics-day-2026-09-28')).toBeAttached();
      await expect(page.getByTestId('metrics-day-2026-09-29')).toHaveCount(0);
    });
  });
});
