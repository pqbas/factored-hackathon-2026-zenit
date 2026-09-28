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

    // Javier is with the assistant: the advisor turns it off to write.
    await page.getByTestId('assistant-switch').click();
    const input = page.getByPlaceholder('Escribe al cliente…');
    await input.fill('Hola, este es un mensaje de prueba');
    await input.press('Enter');

    await expect(agentBubbles).toHaveCount(countBefore + 1);
    await expect(agentBubbles.last()).toContainText('Hola, este es un mensaje de prueba');
  });

  test('shows an empty state with no client selected', async ({ page }) => {
    await expect(page.getByText('Elige una conversación')).toBeVisible();
  });

  test('the Sin atender filter leaves only waiting conversations', async ({ page }) => {
    await page.getByTestId('status-filter-waiting').click();
    const rows = page.locator('[data-testid^="conversation-row-"]');
    await expect(rows).toHaveCount(2);
    for (const row of await rows.all()) {
      await expect(row.getByTestId('status-chip')).toHaveText('Sin atender');
    }
  });

  test('the assistant switch hands the chat to the advisor and back', async ({ page }) => {
    await page.getByTestId('conversation-row-demo-co-1').click();
    const header = page.locator('header');
    const input = page.getByLabel('Mensaje al cliente');
    const assistantSwitch = page.getByTestId('assistant-switch');

    await expect(assistantSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(input).toBeDisabled();

    await assistantSwitch.click();
    await expect(assistantSwitch).toHaveAttribute('aria-checked', 'false');
    await expect(header.getByTestId('status-chip')).toHaveText('En atención');
    await expect(input).toBeEnabled();
  });

  test('Resolver marks the chat resolved and gives it back to the assistant', async ({ page }) => {
    await page.getByTestId('conversation-row-demo-mx-1').click();
    const header = page.locator('header');
    await expect(header.getByTestId('status-chip')).toHaveText('Sin atender');

    await page.getByTestId('resolve-button').click();

    await expect(header.getByTestId('status-chip')).toHaveText('Resuelto');
    await expect(page.getByLabel('Mensaje al cliente')).toBeDisabled();
    await expect(page.getByTestId('resolve-button')).toBeDisabled();
  });

  test('Daniela shows the handoff notice and the hidden-data note', async ({ page }) => {
    await page.getByTestId('conversation-row-demo-ar-1').click();
    await expect(page.getByTestId('system-notice')).toContainText(
      'derivó a un asesor',
    );
    await expect(page.getByTestId('redaction-note')).toHaveText(
      'Ocultamos un código de seguridad',
    );
    await expect(page.getByTestId('customer-meta')).toContainText('+54 9 11 •••• 4821');
  });

  test('a quick reply fills the message field', async ({ page }) => {
    await page.getByTestId('conversation-row-demo-ar-1').click();
    await page.getByRole('button', { name: 'Respuestas rápidas' }).click();
    await page.getByTestId('quick-reply-0').click();
    await expect(page.getByLabel('Mensaje al cliente')).toHaveValue(
      'Ya revisé tu comprobante.',
    );
  });

  test('+ Etiqueta adds a tag to the header', async ({ page }) => {
    await page.getByTestId('conversation-row-demo-ar-1').click();
    await page.getByTestId('add-tag-button').click();
    await page.getByTestId('tag-input').fill('Urgente');
    await page.getByTestId('tag-input').press('Enter');
    await expect(page.locator('header').getByTestId('tag-chip')).toContainText([
      'Urgente',
    ]);
  });
});

test.describe('Nav rail', () => {
  test('switches between the agent and the chats sections', async ({
    adaContext,
  }) => {
    const { page } = adaContext;
    const chatPage = new ChatPage(page);
    await chatPage.createNewChat();
    await expect(page.getByTestId('nav-agent')).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByTestId('nav-chats').click();
    await expect(page).toHaveURL(/\/conversations$/);
    await expect(page.getByTestId('nav-chats')).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByTestId('nav-agent').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(chatPage.multimodalInput).toBeVisible();
  });
});
