import {
  getCachedCliHost,
  getDatabricksToken,
  getDatabricksUserIdentity,
} from '@chat-template/auth';
import { getHostUrl } from '@chat-template/utils';

const GOLD_TABLES = new Set([
  'customer_360', 'customer_products', 'customer_transactions',
  'customer_cases', 'interaction_history',
]);
const SILVER_TABLES = new Set(['customers', 'call_transcripts']);

// The caller is bank-data.ts's fixed SQL, never a user's message or an LLM.
export function warehouseBankStatement(text: string): string {
  if (!/^\s*(SELECT|WITH)\b/i.test(text) || /;|--|\/\*|\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|GRANT|COPY|CALL)\b/i.test(text)) {
    throw new Error('Only a single bank SELECT is allowed');
  }
  return text.replace(/\bbank_ro\.([a-z_]+)\b/g, (_match, table: string) => {
    if (GOLD_TABLES.has(table)) return `workspace.bank_gold.${table}`;
    if (SILVER_TABLES.has(table)) return `workspace.bank_silver.${table}`;
    throw new Error('Bank table is not allowlisted');
  }).replace(/\$(\d+)/g, ':p$1');
}

export async function warehouseBankQuery(text: string, params: string[]): Promise<Record<string, string | null>[]> {
  const statement = warehouseBankStatement(text);
  const token = await getDatabricksToken();
  if (!getCachedCliHost()) await getDatabricksUserIdentity();
  const host = getCachedCliHost() || getHostUrl();
  const response = await fetch(`${host}/api/2.0/sql/statements`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      statement,
      warehouse_id: process.env.BANK_SQL_WAREHOUSE_ID || '07ca55766c9c5097',
      parameters: params.map((value, i) => ({ name: `p${i + 1}`, value, type: 'STRING' })),
      disposition: 'INLINE', wait_timeout: '10s', on_wait_timeout: 'CANCEL', row_limit: 1000,
    }),
  });
  if (!response.ok) throw new Error(`Bank SELECT failed (${response.status})`);
  const result = await response.json() as {
    status?: { state: string };
    manifest?: { truncated?: boolean; schema?: { columns: { name: string }[] } };
    result?: { data_array?: (string | null)[][] };
  };
  if (result.status?.state !== 'SUCCEEDED' || !result.manifest?.schema || result.manifest.truncated) {
    throw new Error('Bank SELECT did not return a complete result');
  }
  const columns = result.manifest.schema.columns;
  return (result.result?.data_array || []).map((row) => {
    if (row.length !== columns.length) throw new Error('Invalid bank row');
    return Object.fromEntries(columns.map((column, i) => [column.name, row[i]]));
  });
}
