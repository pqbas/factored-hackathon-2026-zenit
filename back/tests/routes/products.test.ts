import { expect, test } from '../fixtures';

// The SQL warehouse is mocked by MSW (tests/api-mocking/api-mock-handlers.ts).
test.describe('/api/products', () => {
  test("returns the session customer's name, products and movements", async ({
    adaContext,
  }) => {
    const response = await adaContext.request.get(
      '/api/products?sessionToken=demo-mx-1',
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      customer: {
        customerId: 'CLI-FLEUCGTWGAHL',
        firstName: 'Santiago',
        lastName: 'Contreras López',
      },
      products: [
        {
          productType: 'Tarjeta Crédito',
          last4: '1070',
          currency: 'USD',
          currentBalance: 3332.62,
          creditLimit: 8672.72,
          availableCredit: 5340.1,
        },
      ],
      transactions: [
        {
          date: '2026-06-08T15:00:51.000Z',
          productType: 'Tarjeta Crédito',
          last4: '4930',
          type: 'Purchase',
          merchant: 'Internet Plus',
          amount: 329.44,
          currency: 'USD',
          status: 'Approved',
        },
      ],
    });
  });

  test('rejects a missing, unknown or expired session token', async ({
    adaContext,
  }) => {
    expect((await adaContext.request.get('/api/products')).status()).toBe(400);

    const unknown = await adaContext.request.get(
      '/api/products?sessionToken=nope',
    );
    expect(unknown.status()).toBe(401);
    expect((await unknown.json()).reason).toBe('invalid');

    const expired = await adaContext.request.get(
      '/api/products?sessionToken=demo-expired',
    );
    expect(expired.status()).toBe(401);
    expect((await expired.json()).reason).toBe('expired');
  });

  test('an advisor gets 403; a customer gets the data', async ({
    babbageContext,
    curieContext,
  }) => {
    expect(
      (
        await babbageContext.request.get('/api/products?sessionToken=demo-mx-1')
      ).status(),
    ).toBe(403);
    expect(
      (
        await curieContext.request.get('/api/products?sessionToken=demo-mx-1')
      ).status(),
    ).toBe(200);
  });

  test('the selector list never exposes customer ids', async ({
    adaContext,
  }) => {
    const { customers } = await (
      await adaContext.request.get('/api/demo-customers')
    ).json();
    for (const customer of customers) {
      expect(Object.keys(customer).sort()).toEqual(['label', 'token']);
    }
  });
});
