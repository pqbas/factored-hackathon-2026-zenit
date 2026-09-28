import { expect, test } from '../fixtures';

// playwright.config.ts puts every ada-<n> in ADMIN_EMAILS; babbage is in no
// list. The advisor role is covered by the getRole unit tests.
test.describe('/api/session role', () => {
  test('an admin gets role admin', async ({ adaContext }) => {
    const response = await adaContext.request.get('/api/session');
    expect(response.status()).toBe(200);

    const { user } = await response.json();
    expect(user.email).toBe(`${adaContext.name}@example.com`);
    expect(user.role).toBe('admin');
  });

  test('a user in no list gets role customer', async ({ babbageContext }) => {
    const response = await babbageContext.request.get('/api/session');
    expect(response.status()).toBe(200);

    const { user } = await response.json();
    expect(user.role).toBe('customer');
  });
});
