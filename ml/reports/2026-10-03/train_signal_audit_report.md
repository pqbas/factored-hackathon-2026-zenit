# Training-only signal audit and V5 readiness

Status: aggregate SQL audit completed on 2026-10-03. No V5 model trained. No validation or final-test rows read; no source table changed.

## Evidence

The SQL Statements API read `workspace.bank_silver.transactions VERSION AS OF 1` strictly before 2025-07-01. Statement `01f1bf47-ea1b-15ef-858d-e941cfc97080` succeeded and returned 205 aggregate groups without truncation. [The evidence JSON](train_signal_audit_data.json) contains the exact SQL and counts, with no customer-level records.

Counts reconcile to the original training cohort: **2,994,597 transactions and 3,014 fraud labels**. The proposed internal periods all contain both classes:

| Purpose | Interval | Transactions | Fraud labels | Fraud prevalence |
|---|---|---:|---:|---:|
| Fit | Before 2025-01-01 | 2,271,707 | 2,296 | 0.1011% |
| Select candidate | [2025-01-01, 2025-04-01) | 356,361 | 344 | 0.0965% |
| Select threshold | [2025-04-01, 2025-07-01) | 366,529 | 374 | 0.1020% |

The audit grouped currency, channel, transaction country/type/category, merchant category, hour, and year/month. Among category/hour groups with at least 10,000 transactions and 20 fraud labels, the largest observed marginal rates were:

| Internal period | Group | Transactions | Fraud labels | Fraud prevalence |
|---|---|---:|---:|---:|
| Fit | Hour 9 | 94,958 | 122 | 0.1285% |
| Candidate selection | Hour 7 | 14,856 | 24 | 0.1616% |
| Threshold selection | Merchant category Entertainment | 12,882 | 20 | 0.1553% |

These are descriptive maxima selected after looking at training aggregates; they are not validated rules or model precision. The support filter is a reporting heuristic, not a significance test. The most elevated group differs across periods and remains near the approximately 0.1% baseline. No strong marginal signal is apparent under this limited audit. Interactions and behavioral features remain untested by these aggregates, and these results do not establish random label generation.

The SQL warehouse session timezone was not captured during this query, and source timestamp timezone remains unconfirmed. Hour-level interpretation and exact boundary semantics therefore need verification. The reproducible notebook explicitly sets UTC, matching prior model-run conventions; do not claim the SQL audit independently verified the source timezone.

## New access check

A separate bounded aggregate query on `workspace.bank_silver.digital_events` again failed with SQL state `42501`: `User does not have SELECT on Table workspace.bank_silver.digital_events`. Statement: `01f1bf47-4b68-10b9-b169-fb926ec2882e`. No event counts were obtained and no grant was applied.

## What this changes

The proposed V5 internal periods have sufficient positive-label counts to prepare a bounded capacity/encoding challenger. The executed tree/forest shapes were conservative (at least 1,000 rows per leaf; forest 20 trees, depth 6), so model underfitting deserves a controlled check, while near-chance results remain substantial negative evidence.

[The V5 specification](../../spec/28-09-26-fraud-model/improvement_v5.md) defines CatBoost comparisons, missingness ablation, conditional digital-event features, provenance questions, threshold scenarios, and a frozen-test protocol. Model/dependency installation, fitting, threshold selection, calibration, model registration, and serving have **not** run as part of this audit. The source label's meaning and availability remain unresolved.

Notebook: [08_train_signal_audit.ipynb](../../notebooks/08_train_signal_audit.ipynb). Its sources are output-free. This evidence was produced with the equivalent aggregate SQL directly through the SQL API; it does not establish execution of the notebook on Spark or of CatBoost in the Databricks runtime.

The notebook source was imported successfully into the shared workspace at `/Shared/fraud-eda/08_train_signal_audit`, without overwriting an existing notebook. This import publishes reviewable code; it does not rerun the audit or provision compute.
