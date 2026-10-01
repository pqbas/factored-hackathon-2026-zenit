import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures';

// The demo login (password mode, outside Databricks Apps). The back's login
// isn't in the test server, so the browser gets an in-memory one that follows
// the contract: GET /api/session { user, authMode }, POST /api/login,
// POST /api/logout, and 401 { code: 'unauthorized' } without a session.
const USERS: Record<string, { password: string; role: string; email: string }> = {
  admin: { password: 'pw-admin', role: 'admin', email: 'admin@banco.test' },
  cliente: { password: 'pw-cliente', role: 'customer', email: 'cliente@banco.test' },
};

async function mockPasswordAuth(page: Page) {
  const state: { user: { email: string; name: string; role: string } | null; expired: boolean } = {
    user: null,
    expired: false,
  };
  await page.route('**/api/session', (route) =>
    route.fulfill({ json: { user: state.expired ? null : state.user, authMode: 'password' } }),
  );
  await page.route('**/api/login', async (route) => {
    const { username, password } = route.request().postDataJSON();
    const found = USERS[username];
    if (!found || found.password !== password) {
      return route.fulfill({ status: 401, json: { code: 'invalid_credentials' } });
    }
    state.user = { email: found.email, name: username, role: found.role };
    state.expired = false;
    return route.fulfill({ json: { user: state.user, authMode: 'password' } });
  });
  await page.route('**/api/logout', (route) => {
    state.user = null;
    return route.fulfill({ status: 204 });
  });
  await page.route('**/api/demo-customers', (route) =>
    state.user && !state.expired
      ? route.fulfill({ json: { customers: [{ token: 'demo-mx-1', label: 'Santiago · México' }] } })
      : route.fulfill({ status: 401, json: { code: 'unauthorized' } }),
  );
  await page.route('**/api/products**', (route) =>
    state.expired
      ? route.fulfill({ status: 401, json: { code: 'unauthorized' } })
      : // The demo customer's own 401: not the session.
        route.fulfill({ status: 401, json: { code: 'unauthorized:chat', reason: 'expired' } }),
  );
  return state;
}

test.describe('Demo login', () => {
  test('password mode asks for the login and enters with the role', async ({ page }) => {
    await mockPasswordAuth(page);
    await page.goto('/');
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('nav-agent')).toHaveCount(0);

    await page.getByTestId('login-username').fill('admin');
    await page.getByTestId('login-password').fill('wrong');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toHaveText('Usuario o contraseña incorrectos.');
    await expect(page.getByTestId('nav-agent')).toHaveCount(0);

    await page.getByTestId('login-password').fill('pw-admin');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-form')).toHaveCount(0);
    await expect(page.getByTestId('nav-metrics')).toBeVisible();

    // Closing the session returns to the login.
    await page.getByTestId('logout-button').click();
    await expect(page.getByTestId('login-form')).toBeVisible();
    await expect(page.getByTestId('nav-metrics')).toHaveCount(0);
  });

  test('an expired session returns to the login; a demo customer 401 does not', async ({ page }) => {
    const state = await mockPasswordAuth(page);
    await page.goto('/');
    await page.getByTestId('login-username').fill('cliente');
    await page.getByTestId('login-password').fill('pw-cliente');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('nav-products')).toBeVisible();

    // The demo customer's token expired: its own notice, still signed in.
    await page.getByTestId('nav-products').click();
    await expect(page.getByTestId('products-session-error')).toBeVisible();
    await expect(page.getByTestId('login-form')).toHaveCount(0);

    // The session itself expired: the next API call sends the app to the login.
    state.expired = true;
    await page.getByTestId('nav-agent').click();
    await page.getByTestId('nav-products').click();
    await expect(page.getByTestId('login-form')).toBeVisible();
  });

  test('the login is in Portuguese too', async ({ page }) => {
    await mockPasswordAuth(page);
    await page.goto('/');
    await expect(page.getByTestId('login-submit')).toHaveText('Entrar');
    await page.getByTestId('lang-toggle').click();
    await expect(page.getByTestId('login-form')).toContainText('Usuário');
    await expect(page.getByTestId('login-form')).toContainText('Senha');
  });

  test('Databricks mode has no login and no logout button', async ({ page }) => {
    await page.route('**/api/session', (route) =>
      route.fulfill({ json: { user: { email: 't@banco.test', name: 'T', role: 'admin' } } }),
    );
    await page.goto('/');
    await expect(page.getByTestId('nav-agent')).toBeVisible();
    await expect(page.getByTestId('login-form')).toHaveCount(0);
    await expect(page.getByTestId('logout-button')).toHaveCount(0);
  });
});
