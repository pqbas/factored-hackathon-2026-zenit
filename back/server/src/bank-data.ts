import { getDatabricksToken } from '@chat-template/auth';
import { getWorkspaceHostname } from '@chat-template/ai-sdk-providers';
import { maskSensitive } from './mask';

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

// A blank value from the bank ('' or whitespace) is no value.
const blankToNull = (value: string | null) =>
  value === null || value.trim() === '' ? null : value;

export async function getCustomerProfile(customerId: string) {
  const [row] = await runStatement(
    `SELECT first_name, last_name FROM ${catalog()}.bank_gold.customer_360 WHERE customer_id = :customer_id`,
    [{ name: 'customer_id', value: customerId }],
  );
  return row
    ? { firstName: row.first_name, lastName: row.last_name }
    : { firstName: null, lastName: null };
}

// The console's "Datos del cliente": customer_360 plus the contact data, which
// only bank_silver.customers has. Kept apart from getCustomerProfile so the
// customer's own routes never depend on bank_silver.customers.
async function getCustomerRecord(customerId: string) {
  const [row] = await runStatement(
    `SELECT c.country, c.city, c.segment, c.customer_status,
       c.registration_date, c.preferred_channel, s.email, s.mobile_phone
     FROM ${catalog()}.bank_gold.customer_360 c
     LEFT JOIN ${catalog()}.bank_silver.customers s ON s.customer_id = c.customer_id
     WHERE c.customer_id = :customer_id`,
    [{ name: 'customer_id', value: customerId }],
  );
  return row ?? {};
}

// The profile is secondary to the rest of the context: if it can't be read
// (a missing grant on bank_silver.customers, the warehouse down), the context
// still answers, with profile null.
async function getProfile(customerId: string) {
  try {
    const [record, products] = await Promise.all([
      getCustomerRecord(customerId) as Promise<Row>,
      getProducts(customerId),
    ]);
    return {
      customerId,
      country: blankToNull(record.country ?? null),
      city: blankToNull(record.city ?? null),
      segment: blankToNull(record.segment ?? null),
      status: blankToNull(record.customer_status ?? null),
      customerSince: blankToNull(record.registration_date ?? null),
      products: products.map(({ productType, last4 }) => ({
        productType,
        last4,
      })),
      contact: {
        email: blankToNull(record.email ?? null),
        mobilePhone: blankToNull(record.mobile_phone ?? null),
      },
      preferredChannel: blankToNull(record.preferred_channel ?? null),
    };
  } catch (error) {
    console.error('[customer-context] Profile unavailable for', customerId, error);
    return null;
  }
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

const toBoolean = (value: string | null) =>
  value === null ? null : value === 'true';

// The console's customer context (docs/flujo-atencion.md §4), read-only. The
// transcripts are the ones of the listed interactions (at most one each,
// joined by interaction_id), masked: they're free text from past calls.
export async function getCustomerContext(customerId: string) {
  const parameters = [{ name: 'customer_id', value: customerId }];
  const [name, profile, interactions, cases] = await Promise.all([
    getCustomerProfile(customerId),
    getProfile(customerId),
    runStatement(
      `WITH recent AS (
         SELECT interaction_id, interaction_date, interaction_type, channel, contact_reason, was_resolved, was_escalated, detected_sentiment
         FROM ${catalog()}.bank_gold.interaction_history
         WHERE customer_id = :customer_id
         ORDER BY interaction_date DESC LIMIT 10
       )
       SELECT recent.*, t.transcript_id, t.process_date, t.customer_text, t.agent_text, t.detected_language, t.detected_intents, t.main_topics
       FROM recent
       LEFT JOIN ${catalog()}.bank_silver.call_transcripts t
         ON t.interaction_id = recent.interaction_id
       ORDER BY recent.interaction_date DESC`,
      parameters,
    ),
    runStatement(
      `SELECT case_type, category, creation_date, claimed_amount, currency, priority, status, resolution
       FROM ${catalog()}.bank_gold.customer_cases
       WHERE customer_id = :customer_id
       ORDER BY creation_date DESC LIMIT 20`,
      parameters,
    ),
  ]);

  return {
    customer: { customerId, ...name },
    profile,
    interactions: interactions.map((row) => ({
      interactionId: row.interaction_id,
      hasTranscript: row.transcript_id !== null,
      date: row.interaction_date,
      interactionType: row.interaction_type,
      channel: row.channel,
      reason: row.contact_reason,
      resolved: toBoolean(row.was_resolved),
      escalated: toBoolean(row.was_escalated),
      sentiment: row.detected_sentiment,
    })),
    transcripts: interactions
      .filter((row) => row.transcript_id !== null)
      .map((row) => ({
        interactionId: row.interaction_id,
        date: row.process_date,
        customerText: row.customer_text && maskSensitive(row.customer_text),
        agentText: row.agent_text && maskSensitive(row.agent_text),
        language: row.detected_language,
        intents: row.detected_intents,
        topics: row.main_topics,
      })),
    cases: cases.map((row) => ({
      type: row.case_type,
      category: row.category,
      date: row.creation_date,
      claimedAmount: toNumber(row.claimed_amount),
      currency: row.currency,
      priority: row.priority,
      status: row.status,
      resolution: row.resolution,
    })),
  };
}
