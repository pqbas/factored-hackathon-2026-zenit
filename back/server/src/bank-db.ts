import { getDatabricksToken, getDatabaseUsername } from '@chat-template/auth';
import type postgres from 'postgres';

// The bank's read-only data: the `bank_ro` schema of Lakebase (synced tables
// of the bank_gold / bank_silver Delta tables). It has its own pool, apart from
// the chats' one in @chat-template/db, so it can point somewhere else (locally
// the chats live in Docker and the bank in Lakebase).

export type BankRow = Record<string, string | null>;

export type BankConfig =
  | { kind: 'url'; url: string }
  | {
      kind: 'host';
      host: string;
      port: string;
      database: string;
      // undefined: the caller resolves it (the CLI identity in local).
      user: string | undefined;
      sslMode: string;
    };

// BANK_POSTGRES_URL wins (tests, or any Postgres with its own credentials),
// then BANK_PGHOST, then PGHOST (in prod the bank is the chats' instance).
export function resolveBankConfig(
  env: Record<string, string | undefined> = process.env,
): BankConfig | null {
  if (env.BANK_POSTGRES_URL) {
    return { kind: 'url', url: env.BANK_POSTGRES_URL };
  }
  const host = env.BANK_PGHOST || env.PGHOST;
  if (!host) return null;
  return {
    kind: 'host',
    host,
    port: env.BANK_PGPORT || env.PGPORT || '5432',
    database: env.BANK_PGDATABASE || 'databricks_postgres',
    user: env.BANK_PGUSER || env.PGUSER || undefined,
    sslMode: env.BANK_PGSSLMODE || 'require',
  };
}

export function buildBankUrl(
  config: Extract<BankConfig, { kind: 'host' }>,
  user: string,
  password: string,
) {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${config.host}:${config.port}/${config.database}?sslmode=${config.sslMode}`;
}

// Every value the routes read is text (or null), like the statement API of
// the warehouse returned: numbers stay exact ("3332.62"), timestamps are ISO
// and booleans are "true" / "false".
export function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Parsers that keep what Postgres sends as text, except timestamps (ISO, in
// UTC even for `timestamp` without zone, which the sync may produce).
const rawText = (from: number[]) => ({
  to: 0,
  from,
  serialize: (x: unknown) => String(x),
  parse: (x: string) => x,
});
const bankTypes = {
  // date: '2026-04-22', as is.
  dateOnly: rawText([1082]),
  timestamptz: {
    ...rawText([1184]),
    parse: (x: string) => new Date(x).toISOString(),
  },
  timestamp: {
    ...rawText([1114]),
    parse: (x: string) => new Date(`${x.replace(' ', 'T')}Z`).toISOString(),
  },
  // Same text for numeric-like and boolean columns: 't' / 'f' become the
  // words the mapping in bank-data.ts compares with.
  boolean: {
    to: 16,
    from: [16],
    serialize: (x: unknown) => (x === true ? 't' : 'f'),
    parse: (x: string) => (x === 't' ? 'true' : 'false'),
  },
  // json / jsonb (ARRAY<STRING> columns sync as jsonb): the JSON text.
  json: rawText([114, 3802]),
  number: rawText([21, 23, 26, 700, 701]),
};

let sql: postgres.Sql | null = null;
let currentToken: string | null = null;

async function getPool(): Promise<postgres.Sql> {
  const config = resolveBankConfig();
  if (!config) {
    throw new Error('BANK_POSTGRES_URL, BANK_PGHOST or PGHOST must be set');
  }

  // With a full URL there is no token to renew.
  let url: string;
  let token: string | null = null;
  if (config.kind === 'url') {
    url = config.url;
  } else {
    token = await getDatabricksToken();
    // A changed token means the pool's connections may stop authenticating.
    if (sql && currentToken !== token) {
      console.log('[Bank DB] Token changed, closing existing pool');
      await sql.end();
      sql = null;
    }
    if (!sql) {
      const user = config.user ?? (await getDatabaseUsername());
      url = buildBankUrl(config, user, token);
    } else {
      return sql;
    }
  }

  if (!sql) {
    const { default: postgres } = await import('postgres');
    sql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      // Connections shouldn't outlive the OAuth token (~1 h).
      max_lifetime: 60 * 10,
      types: bankTypes,
    });
    currentToken = token;
    console.log('[Bank DB] Created pool');
  }
  return sql;
}

// One fixed, parameterized statement. `params` are text.
export async function bankQuery(
  text: string,
  params: string[] = [],
): Promise<BankRow[]> {
  const pool = await getPool();
  const rows = await pool.unsafe(text, params);
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([name, value]) => [name, toText(value)]),
    ),
  );
}
