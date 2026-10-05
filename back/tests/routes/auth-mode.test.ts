import { expect, test } from '../fixtures';

// The suite's server runs in databricks mode (no AUTH_MODE): the demo login
// of password mode must not exist, and the rest of the API must be untouched.
test.describe('auth mode: databricks', () => {
  test('the session says its mode and comes from the headers', async ({
    adaContext,
  }) => {
    const body = await (await adaContext.request.get('/api/session')).json();
    expect(body.authMode).toBe('databricks');
    expect(body.user.email).toBeTruthy();
  });

  test('login and logout do not exist', async ({ adaContext }) => {
    const login = await adaContext.request.post('/api/login', {
      data: { username: 'admin', password: 'x' },
    });
    expect(login.status()).toBe(404);
    expect((await adaContext.request.post('/api/logout')).status()).toBe(404);
  });

  test('the demo logins do not exist', async ({ adaContext }) => {
    expect((await adaContext.request.get('/api/demo-logins')).status()).toBe(404);
  });
});
