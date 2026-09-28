import { expect, test } from '@playwright/test';
import { isAdminEmail } from '../../server/src/admin';

test.describe('isAdminEmail', () => {
  const raw = 'admin@example.com, Other-Admin@example.com';

  test('accepts an email in the list', () => {
    expect(isAdminEmail('admin@example.com', raw)).toBe(true);
  });

  test('accepts an email in the list with different casing', () => {
    expect(isAdminEmail('ADMIN@example.com', raw)).toBe(true);
  });

  test('accepts an email in the list stored with surrounding spaces', () => {
    expect(isAdminEmail('other-admin@example.com', raw)).toBe(true);
  });

  test('rejects an email outside the list', () => {
    expect(isAdminEmail('someone-else@example.com', raw)).toBe(false);
  });

  test('rejects when the list is empty', () => {
    expect(isAdminEmail('admin@example.com', '')).toBe(false);
  });

  test('rejects when the list is undefined', () => {
    expect(isAdminEmail('admin@example.com', undefined)).toBe(false);
  });

  test('rejects an empty email', () => {
    expect(isAdminEmail('', raw)).toBe(false);
  });

  test('rejects an undefined email', () => {
    expect(isAdminEmail(undefined, raw)).toBe(false);
  });
});
