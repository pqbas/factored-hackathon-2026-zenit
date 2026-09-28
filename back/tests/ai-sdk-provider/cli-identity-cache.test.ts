import { expect, test } from '@playwright/test';
import { shouldReuseCliIdentity } from '@chat-template/auth';

test.describe('shouldReuseCliIdentity', () => {
  const now = 1_000_000;

  test('reuses a fresh identity while the host is still cached', () => {
    expect(
      shouldReuseCliIdentity({
        identity: 'user@example.com',
        identityExpiresAt: now + 60_000,
        hostCached: true,
        now,
      }),
    ).toBe(true);
  });

  test('refreshes when the host expired even if the identity is fresh', () => {
    // The 503 on :3200: identity cached for 30 min, host for 10 min.
    expect(
      shouldReuseCliIdentity({
        identity: 'user@example.com',
        identityExpiresAt: now + 20 * 60_000,
        hostCached: false,
        now,
      }),
    ).toBe(false);
  });

  test('refreshes when the identity expired or was never fetched', () => {
    expect(
      shouldReuseCliIdentity({
        identity: 'user@example.com',
        identityExpiresAt: now - 1,
        hostCached: true,
        now,
      }),
    ).toBe(false);
    expect(
      shouldReuseCliIdentity({
        identity: null,
        identityExpiresAt: 0,
        hostCached: true,
        now,
      }),
    ).toBe(false);
  });
});
