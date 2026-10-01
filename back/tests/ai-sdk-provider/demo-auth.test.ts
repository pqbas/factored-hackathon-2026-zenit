import { expect, test } from '@playwright/test';
import {
  clientIp,
  createAttemptLimiter,
  findDemoUser,
  getAuthMode,
  hashPassword,
  loadDemoAuthConfig,
  parseDemoUsers,
  readCookie,
  readSession,
  sessionCookie,
  signSession,
  verifyPassword,
} from '../../server/src/demo-auth';

const SECRET = 'a-test-secret-of-at-least-32-characters';
const users = [
  {
    username: 'admin',
    email: 'admin@demo.example',
    name: 'Admin Demo',
    passwordHash: hashPassword('correct horse'),
  },
];

test.describe('demo auth (password mode)', () => {
  test('the mode is password only when AUTH_MODE says so', () => {
    expect(getAuthMode({})).toBe('databricks');
    expect(getAuthMode({ AUTH_MODE: 'other' })).toBe('databricks');
    expect(getAuthMode({ AUTH_MODE: 'password' })).toBe('password');
  });

  test('a password verifies only against its own hash', () => {
    const hash = hashPassword('s3creta');
    expect(hash).toMatch(/^[0-9a-f]{32}:[0-9a-f]{128}$/);
    expect(verifyPassword('s3creta', hash)).toBe(true);
    expect(verifyPassword('S3creta', hash)).toBe(false);
    expect(verifyPassword('s3creta', 'not-a-hash')).toBe(false);
    // Salted: the same password hashes differently each time.
    expect(hashPassword('s3creta')).not.toBe(hash);
  });

  test('finds a user by username (any case) and password', () => {
    expect(findDemoUser(users, ' Admin ', 'correct horse')?.email).toBe(
      'admin@demo.example',
    );
    expect(findDemoUser(users, 'admin', 'wrong')).toBeNull();
    expect(findDemoUser(users, 'nobody', 'correct horse')).toBeNull();
  });

  test('a session cookie reads back; altered, foreign or expired ones do not', () => {
    const now = 1_000_000;
    const value = signSession({ username: 'admin', exp: now + 1000 }, SECRET);
    expect(readSession(value, SECRET, now)).toBe('admin');

    expect(readSession(value, SECRET, now + 1000)).toBeNull();
    expect(readSession(value, `${SECRET}x`, now)).toBeNull();
    expect(readSession(undefined, SECRET, now)).toBeNull();
    expect(readSession('garbage', SECRET, now)).toBeNull();

    // Swapping the payload for another user's keeps the old signature.
    const forged = Buffer.from(
      JSON.stringify({ u: 'asesor', exp: now + 1000 }),
    ).toString('base64url');
    expect(
      readSession(`${forged}.${value.split('.')[1]}`, SECRET, now),
    ).toBeNull();
  });

  test('the cookie is HttpOnly and Lax, and Secure unless told otherwise', () => {
    const secure = sessionCookie('v', true, 12 * 60 * 60_000);
    expect(secure).toBe(
      'bank_session=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=43200; Secure',
    );
    expect(sessionCookie('v', false, 0)).toBe(
      'bank_session=v; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    );
    expect(readCookie('a=1; bank_session=x.y; b=2', 'bank_session')).toBe(
      'x.y',
    );
    expect(readCookie(undefined, 'bank_session')).toBeUndefined();
  });

  test('DEMO_USERS_JSON must be a valid list of users', () => {
    expect(parseDemoUsers(JSON.stringify(users))).toHaveLength(1);
    expect(() => parseDemoUsers(undefined)).toThrow(/required/);
    expect(() => parseDemoUsers('{')).toThrow(/not valid JSON/);
    expect(() => parseDemoUsers('[]')).toThrow(/invalid/);
    expect(() =>
      parseDemoUsers(JSON.stringify([{ ...users[0], passwordHash: 'plain' }])),
    ).toThrow(/invalid/);
    expect(() =>
      parseDemoUsers(
        JSON.stringify([users[0], { ...users[0], username: 'ADMIN' }]),
      ),
    ).toThrow(/duplicate/);
  });

  test('the configuration reports what is missing instead of throwing', () => {
    const env = {
      DEMO_USERS_JSON: JSON.stringify(users),
      SESSION_SECRET: SECRET,
    };
    expect(loadDemoAuthConfig(env)).toMatchObject({
      config: { secret: SECRET, secureCookie: true },
    });
    expect(
      loadDemoAuthConfig({ ...env, SESSION_COOKIE_INSECURE: 'true' }),
    ).toMatchObject({ config: { secureCookie: false } });
    expect(loadDemoAuthConfig({ ...env, SESSION_SECRET: 'short' })).toEqual({
      error: expect.stringContaining('SESSION_SECRET'),
    });
    expect(loadDemoAuthConfig({ SESSION_SECRET: SECRET })).toEqual({
      error: expect.stringContaining('DEMO_USERS_JSON'),
    });
  });

  test('the limiter blocks after the limit and frees with the window', () => {
    const limiter = createAttemptLimiter(3, 1000);
    for (const at of [0, 100, 200]) {
      expect(limiter.isBlocked('ip', at)).toBe(false);
      limiter.fail('ip', at);
    }
    expect(limiter.isBlocked('ip', 300)).toBe(true);
    expect(limiter.isBlocked('other', 300)).toBe(false);
    // The first failure leaves the window at 1000.
    expect(limiter.isBlocked('ip', 1000)).toBe(false);
    limiter.fail('ip', 1001);
    limiter.reset('ip');
    expect(limiter.isBlocked('ip', 1002)).toBe(false);
  });

  test('the client IP is the last X-Forwarded-For entry, the proxy one', () => {
    expect(clientIp('1.1.1.1, 2.2.2.2', '10.0.0.1')).toBe('2.2.2.2');
    // A spoofed first entry doesn't change the key.
    expect(clientIp('9.9.9.9, 2.2.2.2', '10.0.0.1')).toBe('2.2.2.2');
    expect(clientIp(['1.1.1.1', '3.3.3.3'], undefined)).toBe('3.3.3.3');
    expect(clientIp(undefined, '10.0.0.1')).toBe('10.0.0.1');
    expect(clientIp(undefined, undefined)).toBe('unknown');
  });
});
