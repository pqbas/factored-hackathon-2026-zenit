import { expect, test } from '../fixtures';

// The bank's data is the bank_ro fixture (tests/fixtures/bank_ro.sql).
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
          last4: '1070',
          type: 'Purchase',
          merchant: 'Internet Plus',
          amount: 329.44,
          currency: 'USD',
          status: 'Approved',
        },
      ],
    });
  });

  test('only the active cards and savings accounts, and the latest 10 movements', async ({
    adaContext,
  }) => {
    const response = await adaContext.request.get(
      '/api/products?sessionToken=demo-co-1',
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.customer).toEqual({
      customerId: 'CLI-7MPS3ZOPSN4Q',
      firstName: 'Javier',
      lastName: 'Ortiz Vega',
    });
    // The closed card is left out; the savings account has no available credit.
    expect(body.products).toHaveLength(2);
    expect(body.products).toEqual(
      expect.arrayContaining([
        {
          productType: 'Tarjeta Crédito',
          last4: '3001',
          currency: 'COP',
          currentBalance: 1200,
          creditLimit: 5000,
          availableCredit: 3800,
        },
        {
          productType: 'Cuenta Ahorro',
          last4: '5002',
          currency: 'COP',
          currentBalance: 900.5,
          creditLimit: null,
          availableCredit: null,
        },
      ]),
    );
    // 12 movements, the 10 most recent (12..3), newest first. The other
    // customer sharing the card's product_id doesn't add rows (last4 7777).
    expect(body.transactions.map((t: any) => t.merchant)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Shop ${12 - i}`),
    );
    expect(body.transactions[0]).toEqual({
      date: '2026-06-01T12:00:00.000Z',
      productType: 'Tarjeta Crédito',
      last4: '3001',
      type: 'Purchase',
      merchant: 'Shop 12',
      amount: 120,
      currency: 'COP',
      status: 'Approved',
    });
    expect(body.transactions.map((t: any) => t.last4)).not.toContain('7777');
  });

  test('a customer the bank has no data for gets empty lists, not an error', async ({
    adaContext,
  }) => {
    // demo-mx-2 (CLI-0IY07CEBUL79) isn't in the fixture.
    const response = await adaContext.request.get(
      '/api/products?sessionToken=demo-mx-2',
    );
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      customer: {
        customerId: 'CLI-0IY07CEBUL79',
        firstName: null,
        lastName: null,
      },
      products: [],
      transactions: [],
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
