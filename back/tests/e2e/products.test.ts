import { expect, test } from '../fixtures';

// /products reads a fixture exported from the dummy dataset: no back calls.
test.describe('Mis productos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/products');
  });

  test('opens on the summary with the customer profile', async ({ page }) => {
    await expect(page.getByText('Hola, Agustina')).toBeVisible();
    await expect(page.getByTestId('customer-profile')).toContainText('Romero Sosa');
    await expect(page.getByTestId('transaction-row').first()).toBeVisible();
  });

  test('lists one row per product', async ({ page }) => {
    await expect(page.locator('[data-testid^="product-row-PRD"]')).toHaveCount(4);
  });

  test('selecting the credit card shows its limit usage', async ({ page }) => {
    await page.getByTestId('product-row-PRD00000802').click();
    const detail = page.getByTestId('product-detail');
    await expect(detail).toContainText('Tarjeta de crédito');
    await expect(detail).toContainText('de tu límite');
  });

  test('the nav rail opens the section', async ({ page }) => {
    await page.goto('/conversations');
    await page.getByTestId('nav-products').click();
    await expect(page).toHaveURL(/\/products$/);
  });
});
