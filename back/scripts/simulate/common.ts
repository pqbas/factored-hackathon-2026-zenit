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

export function identities(base: string) {
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
