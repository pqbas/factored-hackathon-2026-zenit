import {
  getCachedCliHost,
  getDatabricksToken,
  getDatabricksUserIdentity,
} from '@chat-template/auth';
import { getHostUrl } from '@chat-template/utils';

type Statement = {
  statement_id?: string;
  status?: { state: string };
  manifest?: {
    truncated?: boolean;
    total_chunk_count?: number;
    schema?: { columns: { name: string }[] };
  };
  result?: {
    data_array?: (string | null)[][];
    next_chunk_internal_link?: string;
  };
};
type WarehouseDependencies = {
  authenticate: () => Promise<{ token: string; host: string }>;
  request: typeof fetch;
  now: () => number;
  pause: (ms: number) => Promise<void>;
};

async function bounded<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer!: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Analytics authentication deadline')),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Fixed module SQL only, serialized across analytics reports, <=90s and <=1000 rows. */
export function createAnalyticsWarehouseReader(deps: WarehouseDependencies) {
  let tail = Promise.resolve();
  return async function analyticsWarehouseQuery(
    statement: string,
  ): Promise<{ statementId: string; rows: Record<string, string | null>[] }> {
    if (
      !/^\s*(SELECT|WITH)\b/i.test(statement) ||
      /;|--|\/\*|\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|GRANT|COPY|CALL)\b/i.test(
        statement,
      )
    )
      throw new Error('Only fixed read-only analytics SQL is allowed');
    let release!: () => void;
    const previous = tail;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    let id: string | undefined;
    let host = '';
    let token = '';
    try {
      const started = deps.now();
      ({ token, host } = await bounded(deps.authenticate(), 15_000));
      host = host.replace(/\/$/, '');
      const request = async (
        path: string,
        body?: object,
      ): Promise<Statement> => {
        const remaining = 90_000 - (deps.now() - started);
        if (remaining <= 0) throw new Error('Analytics query deadline');
        const response = await deps.request(`${host}${path}`, {
          method: body ? 'POST' : 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(Math.min(15_000, remaining)),
        });
        if (!response.ok) throw new Error('Analytics warehouse request failed');
        return response.json() as Promise<Statement>;
      };
      let result = await request('/api/2.0/sql/statements', {
        statement,
        warehouse_id: process.env.BANK_SQL_WAREHOUSE_ID || '07ca55766c9c5097',
        disposition: 'INLINE',
        wait_timeout: '10s',
        on_wait_timeout: 'CONTINUE',
        row_limit: 1000,
        byte_limit: 1_000_000,
      });
      id = result.statement_id;
      if (!id) throw new Error('Missing warehouse statement identifier');
      while (['PENDING', 'RUNNING'].includes(result.status?.state ?? '')) {
        if (deps.now() - started > 75_000)
          throw new Error('Analytics query deadline');
        await deps.pause(1500);
        result = await request(
          `/api/2.0/sql/statements/${encodeURIComponent(id)}`,
        );
      }
      if (
        result.status?.state !== 'SUCCEEDED' ||
        !result.manifest?.schema ||
        result.manifest.truncated ||
        (result.manifest.total_chunk_count ?? 1) > 1 ||
        result.result?.next_chunk_internal_link
      )
        throw new Error('Analytics query incomplete');
      const columns = result.manifest.schema.columns;
      const rows = (result.result?.data_array ?? []).map((row) => {
        if (row.length !== columns.length)
          throw new Error('Malformed analytics row');
        return Object.fromEntries(
          columns.map((column, i) => [column.name, row[i]]),
        );
      });
      return { statementId: id, rows };
    } catch (error) {
      // Cancellation prevents a failed/pending read from running indefinitely.
      if (id && host && token) {
        try {
          await deps.request(
            `${host}/api/2.0/sql/statements/${encodeURIComponent(id)}/cancel`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(3000),
            },
          );
        } catch {
          /* bounded best effort */
        }
      }
      throw error;
    } finally {
      release();
    }
  };
}
export const analyticsWarehouseQuery = createAnalyticsWarehouseReader({
  authenticate: async () => {
    const token = await getDatabricksToken();
    if (!getCachedCliHost() && !process.env.DATABRICKS_HOST)
      await getDatabricksUserIdentity();
    return { token, host: getCachedCliHost() || getHostUrl() };
  },
  request: (...args) => fetch(...args),
  now: Date.now,
  pause: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});
