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
