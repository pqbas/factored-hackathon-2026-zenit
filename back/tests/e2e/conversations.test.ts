import { expect, test } from '../fixtures';
import { ChatPage } from '../pages/chat';

// /conversations is mock-only: no back/agent calls, no Databricks session, so
// most of these run against the plain `page` fixture instead of adaContext.
test.describe('Conversations mock view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/conversations');
  });

  test('shows five conversation rows', async ({ page }) => {
    await expect(page.locator('[data-testid^="conversation-row-"]')).toHaveCount(5);
  });

  test('searching "dan" leaves only Daniela', async ({ page }) => {
    await page.getByPlaceholder('Buscar cliente').fill('dan');
    await expect(page.locator('[data-testid^="conversation-row-"]')).toHaveCount(1);
    await expect(page.getByTestId('conversation-row-demo-ar-1')).toContainText('Daniela');
  });

  test('selecting a customer shows bubbles and highlights the row', async ({ page }) => {
    const row = page.getByTestId('conversation-row-demo-mx-1');
    await row.click();

    await expect(row).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('bubble-customer').first()).toBeVisible();
    await expect(page.getByTestId('bubble-agent').first()).toBeVisible();
  });

  test('opening a customer with unread messages clears the badge', async ({ page }) => {
    await expect(page.getByTestId('unread-badge-demo-mx-1')).toBeVisible();

    await page.getByTestId('conversation-row-demo-mx-1').click();

    await expect(page.getByTestId('unread-badge-demo-mx-1')).toHaveCount(0);
  });

  test('sending a message adds an agent bubble with that text', async ({ page }) => {
    await page.getByTestId('conversation-row-demo-co-1').click();

    const agentBubbles = page.getByTestId('bubble-agent');
    const countBefore = await agentBubbles.count();

    await page.getByPlaceholder('Escribe un mensaje').fill('Hola, este es un mensaje de prueba');
    await page.getByPlaceholder('Escribe un mensaje').press('Enter');

    await expect(agentBubbles).toHaveCount(countBefore + 1);
    await expect(agentBubbles.last()).toContainText('Hola, este es un mensaje de prueba');
  });

  test('shows an empty state with no client selected', async ({ page }) => {
    await expect(page.getByText('Elige una conversación')).toBeVisible();
  });
});

test.describe('Chat sidebar navigation', () => {
  test('the "Conversaciones" link from the chat sidebar leads to /conversations', async ({
    adaContext,
  }) => {
    const { page } = adaContext;
    const chatPage = new ChatPage(page);
    await chatPage.createNewChat();
    await chatPage.openSideBar();

    await page.getByRole('button', { name: 'Conversaciones' }).click();
    await expect(page).toHaveURL(/\/conversations$/);

    await page.getByTestId('back-to-chat').click();
    await expect(page).toHaveURL(/\/$/);
  });
});
