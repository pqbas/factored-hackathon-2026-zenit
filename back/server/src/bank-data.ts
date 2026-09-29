import { getDatabricksToken } from '@chat-template/auth';
import { getWorkspaceHostname } from '@chat-template/ai-sdk-providers';

// Reads the bank's data through the same Unity Catalog functions the agent
// uses (agent/uc/bank_uc_consultas.sql), on the SQL warehouse.
const catalog = () => process.env.UC_CATALOG || 'workspace';

type Row = Record<string, string | null>;

async function runStatement(
  statement: string,
  parameters: Array<{ name: string; value: string }>,
): Promise<Row[]> {
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;
  if (!warehouseId) {
    throw new Error('DATABRICKS_WAREHOUSE_ID is not set');
  }

  const [host, token] = await Promise.all([
    getWorkspaceHostname(),
    getDatabricksToken(),
  ]);
  const response = await fetch(
    `${host.replace(/\/$/, '')}/api/2.0/sql/statements`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        warehouse_id: warehouseId,
        statement,
        parameters,
        // Long enough for a serverless warehouse to wake up from auto-stop.
        wait_timeout: '50s',
        on_wait_timeout: 'CANCEL',
      }),
    },
  );

  const body = (await response.json()) as {
    status?: { state?: string; error?: { message?: string } };
    manifest?: { schema?: { columns?: Array<{ name: string }> } };
    result?: { data_array?: Array<Array<string | null>> };
  };
  if (!response.ok || body.status?.state !== 'SUCCEEDED') {
    throw new Error(
      `SQL statement failed (${response.status} ${body.status?.state}): ${body.status?.error?.message ?? ''}`,
    );
  }

  const columns = body.manifest?.schema?.columns?.map((c) => c.name) ?? [];
  return (body.result?.data_array ?? []).map((values) =>
    Object.fromEntries(columns.map((name, i) => [name, values[i] ?? null])),
  );
}

const toNumber = (value: string | null) =>
  value === null ? null : Number(value);

export async function getCustomerProfile(customerId: string) {
  const [row] = await runStatement(
    `SELECT first_name, last_name FROM ${catalog()}.bank_gold.customer_360 WHERE customer_id = :customer_id`,
    [{ name: 'customer_id', value: customerId }],
  );
  return row
    ? { firstName: row.first_name, lastName: row.last_name }
    : { firstName: null, lastName: null };
}

export async function getProducts(customerId: string) {
  const rows = await runStatement(
    `SELECT * FROM ${catalog()}.bank_uc_consultas.get_products(:customer_id)`,
    [{ name: 'customer_id', value: customerId }],
  );
  return rows.map((row) => ({
    productType: row.product_type,
    last4: row.product_number_last4,
    currency: row.currency,
    currentBalance: toNumber(row.current_balance),
    creditLimit: toNumber(row.credit_limit),
    availableCredit: toNumber(row.available_credit),
  }));
}

export async function getTransactions(customerId: string) {
  const rows = await runStatement(
    `SELECT * FROM ${catalog()}.bank_uc_consultas.list_transactions(:customer_id)`,
    [{ name: 'customer_id', value: customerId }],
  );
  return rows.map((row) => ({
    date: row.transaction_date,
    productType: row.product_type,
    last4: row.product_number_last4,
    type: row.transaction_type,
    merchant: row.merchant_name,
    amount: toNumber(row.amount),
    currency: row.currency,
    status: row.transaction_status,
  }));
}
