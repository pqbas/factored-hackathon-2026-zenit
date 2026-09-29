-- Grants for the agent App's service principal. The UC-01 functions read bank_gold.* as
-- the caller, so EXECUTE (declared in databricks.yml) is not enough on its own.
-- ${sp} is the App service principal application id, ${catalog} as in apply_uc.py.
GRANT USE CATALOG ON CATALOG ${catalog} TO `${sp}`;
GRANT USE SCHEMA ON SCHEMA ${catalog}.bank_uc_consultas TO `${sp}`;
-- On the schema, not per function: CREATE OR REPLACE FUNCTION (apply_uc.py) drops a function's
-- own grants, and the App then listed no MCP tools at all.
GRANT EXECUTE ON SCHEMA ${catalog}.bank_uc_consultas TO `${sp}`;
GRANT USE SCHEMA ON SCHEMA ${catalog}.bank_gold TO `${sp}`;
GRANT SELECT ON TABLE ${catalog}.bank_gold.customer_products TO `${sp}`;
GRANT SELECT ON TABLE ${catalog}.bank_gold.customer_transactions TO `${sp}`;
