import { expect, test } from '@playwright/test';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { hashPassword } from '../../server/src/demo-auth';
import { authRouter } from '../../server/src/routes/auth';
import { advisorRouter } from '../../server/src/routes/advisor';

let server: Server;
let base: string;
const saved = { ...process.env };
test.beforeAll(async () => {
  Object.assign(process.env, {
    // Match the login suite: auth configuration is deliberately cached per worker.
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
  });
  delete process.env.POSTGRES_URL;
  delete process.env.PGHOST;
  delete process.env.PGDATABASE;
  // Route tests must never submit real warehouse statements.
  for (const key of ['DATABRICKS_HOST','DATABRICKS_CONFIG_PROFILE','DATABRICKS_CLIENT_ID','DATABRICKS_CLIENT_SECRET']) delete process.env[key];
  const app = express();
  app.use(express.json());
  app.use('/api', authRouter);
  app.use('/api/advisor', advisorRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  for (const key of Object.keys(process.env))
    if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});
async function cookie(username: string) {
  const res = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: `pw-${username}` }),
  });
  expect(res.status).toBe(200);
  return (res.headers.get('set-cookie') ?? '').split(';')[0];
}
const url = () =>
  `${base}/api/advisor/fraud-dashboard?from=2026-10-01&to=2026-10-05&tz=America%2FLima`;

test('requires a session and an admin role on the API', async () => {
  expect((await fetch(url())).status).toBe(401);
  for (const role of ['cliente', 'asesor'])
    expect(
      (await fetch(url(), { headers: { cookie: await cookie(role) } })).status,
    ).toBe(403);
});
test('preserves the deployed public demo choices without exposing configured user hashes', async () => {
  process.env.DEMO_LOGINS_JSON=JSON.stringify([{username:'fixture',password:'fixture-only'}]);
  const res=await fetch(`${base}/api/demo-logins`);
  expect(res.status).toBe(200);expect(await res.json()).toEqual({logins:[{username:'fixture',password:'fixture-only'}]});
  process.env.DEMO_LOGINS_JSON='not json';
  expect(await (await fetch(`${base}/api/demo-logins`)).json()).toEqual({logins:[]});
  delete process.env.DEMO_LOGINS_JSON;
});
test('retention is admin-only and returns a cache state without waiting for compute', async () => {
  const path=`${base}/api/advisor/retention-dashboard`;
  expect((await fetch(path)).status).toBe(401);
  for(const role of ['cliente','asesor']) expect((await fetch(path,{headers:{cookie:await cookie(role)}})).status).toBe(403);
  const res=await fetch(path,{headers:{cookie:await cookie('admin')}});
  expect(res.status).toBe(200);expect(res.headers.get('cache-control')).toBe('no-store');
  const body=await res.json();expect(body.data).toBeNull();expect(body.source.provider).toBe('databricks_sql');
  expect(body.source.tables).toHaveLength(4);expect(body).not.toHaveProperty('credentials');
});
test('admin receives historical evidence even without storage', async () => {
  const res = await fetch(url(), {
    headers: { cookie: await cookie('admin') },
  });
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const body = await res.json();
  expect(body.operational.status).toBe('unavailable');
  expect(body.snapshot.dataset.total).toBe(4425008);
  expect(body.window.tz).toBe('America/Lima');
  expect(body).not.toHaveProperty('facts');
});
test('rejects invalid dates, excessive ranges, duplicate parameters and timezones', async () => {
  const headers = { cookie: await cookie('admin') };
  for (const query of [
    'from=2026-09-01&to=2026-10-05',
    'from=2026-02-30&to=2026-03-01',
    'from=2026-10-05&to=2026-10-01',
    'from=2026-10-01&to=2026-10-05&tz=Mars%2FOlympus',
    'from=2026-10-01&from=2026-10-02&to=2026-10-05',
    '',
  ]) {
    expect(
      (await fetch(`${base}/api/advisor/fraud-dashboard?${query}`, { headers }))
        .status,
    ).toBe(400);
  }
});
