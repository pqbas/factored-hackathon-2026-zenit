import { expect, test } from '@playwright/test';
import { chatScopeCondition, getChats } from '@chat-template/db';

test.describe('chat scope', () => {
  test("'all' adds no user filter", () => {
    expect(chatScopeCondition('all')).toBeUndefined();
  });

  test('a user scope adds a user filter', () => {
    expect(chatScopeCondition({ userId: 'ada-id' })).toBeDefined();
  });

  test('a user scope with an empty id throws instead of listing every chat', () => {
    expect(() => chatScopeCondition({ userId: '' })).toThrow();
  });

  test('getChats rejects an empty user id before touching the database', async () => {
    await expect(
      getChats({
        scope: { userId: '' },
        limit: 10,
        startingAfter: null,
        endingBefore: null,
      }),
    ).rejects.toThrow();
  });
});
