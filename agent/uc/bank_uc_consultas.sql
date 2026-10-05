CREATE SCHEMA IF NOT EXISTS ${catalog}.bank_uc_consultas;

CREATE OR REPLACE FUNCTION ${catalog}.bank_uc_consultas.get_products(
  customer_id STRING COMMENT 'The session customer id whose active products to return.'
)
RETURNS TABLE (
  product_type STRING,
  product_number_last4 STRING,
  currency STRING,
  current_balance DECIMAL(18,2),
  credit_limit DECIMAL(18,2),
  available_credit DECIMAL(18,2)
)
COMMENT 'Returns the customer active credit cards and savings accounts: last 4 digits, currency, current balance, credit limit and available credit (credit_limit - current_balance, NULL for savings accounts).'
RETURN
  SELECT
    product_type,
    product_number_last4,
    currency,
    current_balance,
    credit_limit,
    CASE WHEN product_type = 'Tarjeta Crédito' THEN credit_limit - current_balance ELSE NULL END AS available_credit
  FROM ${catalog}.bank_gold.customer_products
  WHERE customer_id = get_products.customer_id
    AND product_type IN ('Tarjeta Crédito', 'Cuenta Ahorro')
    AND product_status = 'Active';

CREATE OR REPLACE FUNCTION ${catalog}.bank_uc_consultas.list_transactions(
  customer_id STRING COMMENT 'The session customer id whose movements to return.',
  product_last4 STRING DEFAULT NULL COMMENT 'Last 4 digits of a single card or account to filter to, or NULL to return movements of every active product.'
)
RETURNS TABLE (
  transaction_date TIMESTAMP,
  product_type STRING,
  product_number_last4 STRING,
  transaction_type STRING,
  merchant_name STRING,
  amount DECIMAL(18,2),
  currency STRING,
  transaction_status STRING
)
COMMENT 'Returns the 10 most recent movements of the customer active credit cards and savings accounts, each with its date, product, last 4 digits, type, merchant, amount and status. Pass product_last4 to see only one product movements.'
RETURN
  SELECT
    t.transaction_date,
    p.product_type,
    p.product_number_last4,
    t.transaction_type,
    t.merchant_name,
    t.amount,
    t.currency,
    t.transaction_status
  FROM ${catalog}.bank_gold.customer_transactions t
  JOIN ${catalog}.bank_gold.customer_products p
    ON t.product_id = p.product_id AND t.customer_id = p.customer_id
  WHERE t.customer_id = list_transactions.customer_id
    AND p.product_type IN ('Tarjeta Crédito', 'Cuenta Ahorro')
    AND p.product_status = 'Active'
    AND (list_transactions.product_last4 IS NULL OR p.product_number_last4 = list_transactions.product_last4)
  ORDER BY t.transaction_date DESC
  LIMIT 10;

CREATE OR REPLACE FUNCTION ${catalog}.bank_uc_consultas.get_cases(
  customer_id STRING COMMENT 'The session customer id whose complaints and cases to return.'
)
RETURNS TABLE (
  complaint_id STRING,
  creation_date TIMESTAMP,
  case_type STRING,
  category STRING,
  subcategory STRING,
  claimed_amount DECIMAL(15,2),
  currency STRING,
  priority STRING,
  status STRING,
  is_open BOOLEAN,
  resolution_date TIMESTAMP,
  resolution STRING,
  compensation_granted DECIMAL(15,2)
)
COMMENT 'Returns the customer 10 most recent complaints and cases: id, date, type, category, subcategory, claimed amount and currency, priority, status (Open, In Process, Resolved, Closed, Rejected), whether it is open, resolution date, resolution and compensation granted.'
RETURN
  SELECT
    complaint_id,
    creation_date,
    case_type,
    category,
    subcategory,
    claimed_amount,
    currency,
    priority,
    status,
    is_open,
    resolution_date,
    resolution,
    compensation_granted
  FROM ${catalog}.bank_gold.customer_cases
  WHERE customer_id = get_cases.customer_id
  ORDER BY creation_date DESC
  LIMIT 10;
