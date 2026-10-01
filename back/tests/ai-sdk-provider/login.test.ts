import { expect, test } from '@playwright/test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { hashPassword } from '../../server/src/demo-auth';
import {
  authMiddleware,
  requireSessionInPasswordMode,
} from '../../server/src/middleware/auth';
import { authRouter } from '../../server/src/routes/auth';
import { sessionRouter } from '../../server/src/routes/session';

// The login of password mode, against an Express app with the real
// middleware and routers on a free port. It needs no database: the rest of
// the suite runs in databricks mode (see tests/routes). The mode is read per
// request and the configuration on first use, so the env set in beforeAll
// is the one they see.
const ENV = {
  AUTH_MODE: 'password',
  SESSION_SECRET: 'a-test-secret-of-at-least-32-characters',
  SESSION_COOKIE_INSECURE: 'true',
  ADMIN_EMAILS: 'admin@demo.example',
  ADVISOR_EMAILS: 'asesor@demo.example',
  DEMO_USERS_JSON: JSON.stringify(
    ['admin', 'asesor', 'cliente'].map((username) => ({
      username,
      email: `${username}@demo.example`,
      name: `${username} demo`,
      passwordHash: hashPassword(`pw-${username}`),
    })),
  ),
};

let server: Server;
let base: string;
const saved: Record<string, string | undefined> = {};

test.beforeAll(async () => {
  for (const [key, value] of Object.entries(ENV)) {
    saved[key] = process.env[key];
    process.env[key] = value;
  }
  const app = express();
  app.use(express.json());
  app.use(requireSessionInPasswordMode);
  app.use('/api', authRouter);
  app.use('/api/session', sessionRouter);
  app.get('/api/history', authMiddleware, (req, res) => {
    res.json({ email: req.session?.user.email });
  });
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

const login = (username: string, password: string, ip = '1.1.1.1') =>
  fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ username, password }),
  });

const cookieOf = (response: Response) =>
  (response.headers.get('set-cookie') ?? '').split(';')[0];

test.describe('login (password mode)', () => {
  test('without a cookie there is no user, and the API is closed', async () => {
    const session = await fetch(`${base}/api/session`);
    expect(await session.json()).toEqual({ user: null, authMode: 'password' });

    const history = await fetch(`${base}/api/history`);
    expect(history.status).toBe(401);
    expect(await history.json()).toEqual({ code: 'unauthorized' });
  });

  test('each user signs in and gets the role of its email', async () => {
    for (const [username, role] of [
      ['admin', 'admin'],
      ['asesor', 'advisor'],
      ['cliente', 'customer'],
    ]) {
      const response = await login(username, `pw-${username}`);
      expect(response.status).toBe(200);
      const body = {
        user: {
          email: `${username}@demo.example`,
          name: `${username} demo`,
          preferredUsername: username,
          role,
        },
        authMode: 'password',
      };
      expect(await response.json()).toEqual(body);
      expect(response.headers.get('set-cookie')).toMatch(
        /^bank_session=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=43200$/,
      );

      const cookie = cookieOf(response);
      const session = await fetch(`${base}/api/session`, {
        headers: { cookie },
      });
      expect(await session.json()).toEqual(body);
      const history = await fetch(`${base}/api/history`, {
        headers: { cookie },
      });
      expect(await history.json()).toEqual({
        email: `${username}@demo.example`,
      });
    }
  });

  test('a forged X-Forwarded-User gives no session', async () => {
    const headers = {
      'x-forwarded-user': 'intruder',
      'x-forwarded-email': 'admin@demo.example',
    };
    const session = await fetch(`${base}/api/session`, { headers });
    expect((await session.json()).user).toBeNull();
    expect((await fetch(`${base}/api/history`, { headers })).status).toBe(401);
  });

  test('a tampered cookie gives no session', async () => {
    const cookie = cookieOf(await login('cliente', 'pw-cliente'));
    const tampered = `${cookie.slice(0, -2)}xx`;
    const session = await fetch(`${base}/api/session`, {
      headers: { cookie: tampered },
    });
    expect((await session.json()).user).toBeNull();
  });

  test('logout expires the cookie', async () => {
    const response = await fetch(`${base}/api/logout`, { method: 'POST' });
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBe(
      'bank_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    );
  });

  test('wrong credentials give 401, and the 11th failure of an IP gives 429', async () => {
    const ip = '7.7.7.7';
    for (let i = 0; i < 10; i++) {
      // The first X-Forwarded-For entry is the client's own: spoofing it
      // doesn't open a new counter.
      const response = await login('admin', 'wrong', `${i}.0.0.1, ${ip}`);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ code: 'invalid_credentials' });
    }
    const blocked = await login('admin', 'pw-admin', ip);
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toEqual({ code: 'too_many_attempts' });
    // Another IP still signs in.
    expect((await login('admin', 'pw-admin', '8.8.8.8')).status).toBe(200);
    // A body without credentials is a failed attempt, not an error.
    const empty = await fetch(`${base}/api/login`, { method: 'POST' });
    expect(empty.status).toBe(401);
  });
});
