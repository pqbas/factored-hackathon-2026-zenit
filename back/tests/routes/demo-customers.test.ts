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
});
