import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';

// Shared by day.ts and cleanup.ts. No import.meta here, so tests can load it.

const INSTANCE = 'bank-assistant-chat-db';

const profile = () => process.env.DATABRICKS_CONFIG_PROFILE ?? 'DEFAULT';

function databricks(args: string[]): unknown {
  return JSON.parse(
    execFileSync('databricks', [...args, '-p', profile(), '-o', 'json'], {
      encoding: 'utf8',
    }),
  );
}

// Lakebase as the instance owner (the CLI identity): host, user and a fresh
// credential from the CLI. SIM_PG_URL points the script at any other Postgres
// (a local copy of the fixture, for dry runs).
export function openLakebase(): postgres.Sql {
  if (process.env.SIM_PG_URL) {
    return postgres(process.env.SIM_PG_URL, { max: 4, connect_timeout: 10 });
  }
  const instance = databricks([
    'database',
    'get-database-instance',
    INSTANCE,
  ]) as { read_write_dns: string };
  const me = databricks(['current-user', 'me']) as { userName: string };
  const credential = databricks([
    'database',
    'generate-database-credential',
    '--json',
    JSON.stringify({ instance_names: [INSTANCE], request_id: randomUUID() }),
  ]) as { token: string };
  return postgres({
    host: instance.read_write_dns,
    port: 5432,
    database: 'databricks_postgres',
    username: me.userName,
    password: credential.token,
    ssl: 'require',
    max: 4,
    connect_timeout: 10,
  });
}

const isLocal = (base: string) =>
  ['localhost', '127.0.0.1'].includes(new URL(base).hostname);

// Against a deployed App every request goes as the CLI user with its OAuth
// token (the App's proxy decides who that is; it must be an admin). Locally,
// the simulated customers and the admin are X-Forwarded-* headers.
export function cliToken(): Record<string, string> {
  const out = databricks(['auth', 'token']) as { access_token: string };
  return { Authorization: `Bearer ${out.access_token}` };
}

const isDatabricksApp = (base: string) =>
  new URL(base).hostname.endsWith('.databricksapps.com');

// The demo login of password mode (AWS): the admin's session cookie, from
// SIM_ADMIN_USER / SIM_ADMIN_PASSWORD. Never logged.
export async function passwordLogin(base: string): Promise<string> {
  const username = process.env.SIM_ADMIN_USER;
  const password = process.env.SIM_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error(
      `${base} uses the demo login: set SIM_ADMIN_USER and SIM_ADMIN_PASSWORD`,
    );
  }
  const response = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) {
    throw new Error(`POST /api/login -> HTTP ${response.status}`);
  }
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('POST /api/login set no session cookie');
  return cookie;
}

// Locally: X-Forwarded-* headers. A Databricks App: the CLI user's token.
// Anything else (AWS, password mode): the admin's cookie, as customer and
// admin both, like the CLI user on Databricks.
export async function identities(base: string) {
  if (!isLocal(base) && !isDatabricksApp(base)) {
    const headers = { Cookie: await passwordLogin(base) };
    return { customer: () => headers, admin: () => headers };
  }
  if (isLocal(base)) {
    const customer = {
      'X-Forwarded-User': 'sim-cliente',
      'X-Forwarded-Email': 'sim-cliente@example.com',
    };
    const admin = {
      'X-Forwarded-User': 'sim-admin',
      'X-Forwarded-Email': process.env.EVAL_ADMIN_EMAIL ?? 'pcubasm1@gmail.com',
    };
    return { customer: () => customer, admin: () => admin };
  }
  // The token expires (~1 h): ask again on each use; the CLI caches it.
  return { customer: cliToken, admin: cliToken };
}
