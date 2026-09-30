import { bankQuery, type BankRow as Row } from './bank-db';
import { maskSensitive } from './mask';

// Reads the bank's data from the read-only `bank_ro` schema of Lakebase (synced
// tables of bank_gold / bank_silver, see scripts/bank-ro/). The products and
// movements queries replicate the UC functions the agent used to call
// (agent/uc/bank_uc_consultas.sql: get_products, list_transactions).

const toNumber = (value: string | null) =>
  value === null ? null : Number(value);

// A blank value from the bank ('' or whitespace) is no value.
const blankToNull = (value: string | null) =>
  value === null || value.trim() === '' ? null : value;

export async function getCustomerProfile(customerId: string) {
  const [row] = await bankQuery(
    'SELECT first_name, last_name FROM bank_ro.customer_360 WHERE customer_id = $1',
    [customerId],
  );
  return row
    ? { firstName: row.first_name, lastName: row.last_name }
    : { firstName: null, lastName: null };
}

// The console's "Datos del cliente": customer_360 plus the contact data, which
// only bank_ro.customers has. Kept apart from getCustomerProfile so the
// customer's own routes never depend on bank_ro.customers.
async function getCustomerRecord(customerId: string) {
  const [row] = await bankQuery(
    `SELECT c.country, c.city, c.segment, c.customer_status,
       c.registration_date, c.preferred_channel, s.email, s.mobile_phone
     FROM bank_ro.customer_360 c
     LEFT JOIN bank_ro.customers s ON s.customer_id = c.customer_id
     WHERE c.customer_id = $1`,
    [customerId],
  );
  return row ?? {};
}

// The profile is secondary to the rest of the context: if it can't be read
// (a missing grant on bank_ro.customers, Lakebase down), the context
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
  const rows = await bankQuery(
    `SELECT product_type, product_number_last4, currency, current_balance, credit_limit,
       CASE WHEN product_type = 'Tarjeta Crédito' THEN credit_limit - current_balance ELSE NULL END AS available_credit
     FROM bank_ro.customer_products
     WHERE customer_id = $1
       AND product_type IN ('Tarjeta Crédito', 'Cuenta Ahorro')
       AND product_status = 'Active'`,
    [customerId],
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
  const rows = await bankQuery(
    `SELECT t.transaction_date, p.product_type, p.product_number_last4, t.transaction_type,
       t.merchant_name, t.amount, t.currency, t.transaction_status
     FROM bank_ro.customer_transactions t
     JOIN bank_ro.customer_products p
       ON t.product_id = p.product_id AND t.customer_id = p.customer_id
     WHERE t.customer_id = $1
       AND p.product_type IN ('Tarjeta Crédito', 'Cuenta Ahorro')
       AND p.product_status = 'Active'
     ORDER BY t.transaction_date DESC
     LIMIT 10`,
    [customerId],
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
  const parameters = [customerId];
  const [name, profile, interactions, cases] = await Promise.all([
    getCustomerProfile(customerId),
    getProfile(customerId),
    bankQuery(
      `WITH recent AS (
         SELECT interaction_id, interaction_date, interaction_type, channel, contact_reason, was_resolved, was_escalated, detected_sentiment
         FROM bank_ro.interaction_history
         WHERE customer_id = $1
         ORDER BY interaction_date DESC LIMIT 10
       )
       SELECT recent.*, t.transcript_id, t.process_date, t.customer_text, t.agent_text, t.detected_language, t.detected_intents, t.main_topics
       FROM recent
       LEFT JOIN bank_ro.call_transcripts t
         ON t.interaction_id = recent.interaction_id
       ORDER BY recent.interaction_date DESC`,
      parameters,
    ),
    bankQuery(
      `SELECT case_type, category, creation_date, claimed_amount, currency, priority, status, resolution
       FROM bank_ro.customer_cases
       WHERE customer_id = $1
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
