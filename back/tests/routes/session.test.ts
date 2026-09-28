import { expect, test } from '../fixtures';

// playwright.config.ts puts every ada-<n> in ADMIN_EMAILS and every
// babbage-<n> in ADVISOR_EMAILS; curie is in no list.
test.describe('/api/session role', () => {
  test('an admin gets role admin', async ({ adaContext }) => {
    const response = await adaContext.request.get('/api/session');
    expect(response.status()).toBe(200);

    const { user } = await response.json();
    expect(user.email).toBe(`${adaContext.name}@example.com`);
    expect(user.role).toBe('admin');
  });

  test('an advisor gets role advisor', async ({ babbageContext }) => {
    const response = await babbageContext.request.get('/api/session');
    expect(response.status()).toBe(200);

    const { user } = await response.json();
    expect(user.role).toBe('advisor');
  });

  test('a user in no list gets role customer', async ({ curieContext }) => {
    const response = await curieContext.request.get('/api/session');
    expect(response.status()).toBe(200);

    const { user } = await response.json();
    expect(user.role).toBe('customer');
  });
});
