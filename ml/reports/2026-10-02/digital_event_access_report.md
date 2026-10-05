# Digital Event Coverage Audit — Access Result

Status: blocked by a missing read grant; no data profiling ran.

On 2026-10-02, the audit notebook `/Shared/fraud-eda/04_digital_event_coverage` attempted a read-only query against `workspace.bank_silver.digital_events`. Databricks returned:

`[INSUFFICIENT_PERMISSIONS] User does not have SELECT on Table 'workspace.bank_silver.digital_events'. SQLSTATE: 42501`

The initial task failed at the aggregate action. Its automatic retry was canceled to avoid spending compute on a known permission failure. The source table was not modified, and no rows or outputs were written. The notebook includes an exact-time fixture and is ready to rerun when access is granted.

Required access: **SELECT on `workspace.bank_silver.digital_events` for `diegoalonsorv02@gmail.com`**. No write or schema-creation permission is needed for this audit.

The failed one-time run was `491496908300477`; the notebook remains visible at `/Shared/fraud-eda/04_digital_event_coverage`.
