import { expect, test } from '@playwright/test';
import {
  DEFAULT_DEMO_CUSTOMERS,
  getDemoCustomers,
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
