import { expect, test } from '@playwright/test';
import { getRole, isEmailInList } from '../../server/src/roles';

test.describe('isEmailInList', () => {
  const raw = 'admin@example.com, Other-Admin@example.com';

  test('accepts an email in the list', () => {
    expect(isEmailInList('admin@example.com', raw)).toBe(true);
  });

  test('accepts an email in the list with different casing', () => {
    expect(isEmailInList('ADMIN@example.com', raw)).toBe(true);
  });

  test('accepts an email in the list stored with surrounding spaces', () => {
    expect(isEmailInList('other-admin@example.com', raw)).toBe(true);
  });

  test('rejects an email outside the list', () => {
    expect(isEmailInList('someone-else@example.com', raw)).toBe(false);
  });

  test('rejects when the list is empty', () => {
    expect(isEmailInList('admin@example.com', '')).toBe(false);
  });

  test('rejects when the list is undefined', () => {
    expect(isEmailInList('admin@example.com', undefined)).toBe(false);
  });

  test('rejects an empty email', () => {
    expect(isEmailInList('', raw)).toBe(false);
  });

  test('rejects an undefined email', () => {
    expect(isEmailInList(undefined, raw)).toBe(false);
  });
});

test.describe('getRole', () => {
  const originalAdmins = process.env.ADMIN_EMAILS;
  const originalAdvisors = process.env.ADVISOR_EMAILS;

  test.beforeEach(() => {
    process.env.ADMIN_EMAILS = 'boss@example.com';
    process.env.ADVISOR_EMAILS = 'advisor@example.com, boss@example.com';
  });

  test.afterEach(() => {
    for (const [key, value] of [
      ['ADMIN_EMAILS', originalAdmins],
      ['ADVISOR_EMAILS', originalAdvisors],
    ] as const) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  });

  test('admin wins over advisor when an email is in both lists', () => {
    expect(getRole('boss@example.com')).toBe('admin');
  });

  test('an email only in ADVISOR_EMAILS is an advisor', () => {
    expect(getRole('Advisor@example.com')).toBe('advisor');
  });

  test('anyone else is a customer', () => {
    expect(getRole('someone@example.com')).toBe('customer');
    expect(getRole(undefined)).toBe('customer');
  });
});
