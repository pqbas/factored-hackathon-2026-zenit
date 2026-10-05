import { describe, expect, it } from 'vitest';

import { authModeOf, isSessionExpired, loginErrorOf } from '@/lib/auth';

describe('authModeOf', () => {
  it('is password only when the back says so', () => {
    expect(authModeOf({ user: null, authMode: 'password' })).toBe('password');
    expect(authModeOf({ user: null, authMode: 'databricks' })).toBe('databricks');
    // A back that doesn't send it is Databricks Apps.
    expect(authModeOf({ user: null })).toBe('databricks');
    expect(authModeOf(null)).toBe('databricks');
  });
});

describe('loginErrorOf', () => {
  it('maps the status to what the login screen says', () => {
    expect(loginErrorOf(401)).toBe('invalid');
    expect(loginErrorOf(429)).toBe('rate-limited');
    expect(loginErrorOf(500)).toBe('failed');
  });
});

describe('isSessionExpired', () => {
  const res = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('is only a 401 with exactly the unauthorized code', async () => {
    expect(await isSessionExpired(res(401, { code: 'unauthorized' }))).toBe(true);
    // The demo customer's token: not the session.
    expect(await isSessionExpired(res(401, { code: 'unauthorized:chat', reason: 'expired' }))).toBe(false);
    expect(await isSessionExpired(res(403, { code: 'unauthorized' }))).toBe(false);
    expect(await isSessionExpired(new Response('nope', { status: 401 }))).toBe(false);
  });

  it('leaves the body readable for the caller', async () => {
    const response = res(401, { code: 'unauthorized' });
    await isSessionExpired(response);
    expect(await response.json()).toEqual({ code: 'unauthorized' });
  });
});
