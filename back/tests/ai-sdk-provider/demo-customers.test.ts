import { expect, test } from '@playwright/test';
import {
  DEFAULT_DEMO_CUSTOMERS,
  getDemoCustomers,
  tokenForCustomerId,
} from '../../server/src/demo-customers';

test.describe('getDemoCustomers', () => {
  const originalEnv = process.env.DEMO_CUSTOMERS_JSON;

  test.afterEach(() => {
    // Note: assign '' rather than `undefined` - Node coerces an `undefined`
    // assignment to process.env into the (truthy) string "undefined".
    process.env.DEMO_CUSTOMERS_JSON = originalEnv ?? '';
  });

  test('returns the defaults when the env var is unset', () => {
    process.env.DEMO_CUSTOMERS_JSON = '';
    expect(getDemoCustomers()).toEqual(DEFAULT_DEMO_CUSTOMERS);
  });

  test('returns the parsed list when the env var is valid JSON', () => {
    const customers = [
      { token: 'demo-custom-1', label: 'Custom Customer', customerId: 'CLI-X' },
    ];
    process.env.DEMO_CUSTOMERS_JSON = JSON.stringify(customers);
    expect(getDemoCustomers()).toEqual(customers);
  });

  test('falls back to the defaults when the env var is invalid JSON', () => {
    process.env.DEMO_CUSTOMERS_JSON = 'not-json';
    expect(getDemoCustomers()).toEqual(DEFAULT_DEMO_CUSTOMERS);
  });

  test('falls back to the defaults when the env var does not match the schema', () => {
    process.env.DEMO_CUSTOMERS_JSON = JSON.stringify([{ token: 'x' }]);
    expect(getDemoCustomers()).toEqual(DEFAULT_DEMO_CUSTOMERS);
  });
});

test.describe('demo customers', () => {
  test('demo-mx-2 is Eduardo in the default list', () => {
    expect(
      DEFAULT_DEMO_CUSTOMERS.find((c) => c.token === 'demo-mx-2'),
    ).toMatchObject({ customerId: 'CLI-0IY07CEBUL79' });
  });
});

test.describe('tokenForCustomerId', () => {
  const originalEnv = process.env.DEMO_CUSTOMERS_JSON;

  test.afterEach(() => {
    process.env.DEMO_CUSTOMERS_JSON = originalEnv ?? '';
  });

  test('returns the live token of the customer', () => {
    process.env.DEMO_CUSTOMERS_JSON = '';
    expect(tokenForCustomerId('CLI-0IY07CEBUL79')).toBe('demo-mx-2');
  });

  test('returns undefined for an unknown id', () => {
    process.env.DEMO_CUSTOMERS_JSON = '';
    expect(tokenForCustomerId('CLI-NOPE')).toBeUndefined();
  });

  test('never returns an expired token that shares the id', () => {
    process.env.DEMO_CUSTOMERS_JSON = '';
    expect(tokenForCustomerId('CLI-FLEUCGTWGAHL')).toBe('demo-mx-1');
    process.env.DEMO_CUSTOMERS_JSON = JSON.stringify([
      { token: 'demo-expired', label: 'x', customerId: 'CLI-E', expired: true },
    ]);
    expect(tokenForCustomerId('CLI-E')).toBeUndefined();
  });
});
