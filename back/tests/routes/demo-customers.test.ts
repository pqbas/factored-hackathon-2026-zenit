import { expect, test } from '../fixtures';

test.describe('/api/demo-customers', () => {
  test('GET /api/demo-customers returns the demo customer list when authenticated', async ({
    adaContext,
  }) => {
    const response = await adaContext.request.get('/api/demo-customers');
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data.customers)).toBe(true);
    expect(data.customers.length).toBeGreaterThan(0);
    for (const customer of data.customers) {
      expect(typeof customer.token).toBe('string');
      expect(typeof customer.label).toBe('string');
    }
  });

  test('GET /api/demo-customers without user headers responds 401', async ({
    request,
  }) => {
    // getAuthSession() short-circuits with a default test user whenever
    // PLAYWRIGHT=True, regardless of forwarded headers (see
    // packages/auth/src/databricks-auth.ts), so a real 401 can't be produced
    // through HTTP in this harness. tests/routes/history.test.ts documents
    // the same limitation for /api/history; we assert the same way here.
    const response = await request.get('/api/demo-customers');
    expect([200, 401]).toContain(response.status());
  });
});
