# V4 Customer Familiarity and Location Challenger

Status: completed exploratory validation-only experiment. **Not promoted.** It read no final-test rows and wrote no source or scoring table.

## Scope

- Source: `workspace.bank_silver.transactions`, Delta version 1.
- Train: 2,994,597 transactions, 3,014 fraud labels, before 2025-07-01.
- Validation: 743,909 transactions, 699 fraud labels (0.0940%), from 2025-07-01 through 2025-12-31.
- Base predictors: V3 transaction context and V2 strictly prior customer activity.
- New features: customer-specific merchant count / new-merchant flag over the prior 30 days; number of transactions with usable location over that period; new coarse-location flag; and distance from the customer's prior 30-day coarse-location center.
- Merchant names and raw coordinates are intermediate join/window inputs only; neither is included in the predictor vector. Every new history window is `[T - 30 days, T)`, excluding the current transaction and same-time records. Missing merchant/location values stay missing rather than being called new.
- Imputation and category indexing were fitted on train only. Validation prevalence was left natural.
- Notebook: `/Shared/fraud-eda/06_behavioral_challenger`.
- Databricks run: `959921764536485`; MLflow experiment: `/Shared/fraud-eda/phase4-behavioral-challenger`; parent run: `158769c19b9a4e61bcd87d14d7f059d3`.

## Results

The best candidate was a shallow decision tree with areaUnderPR **0.00093963**, exactly equal to the validation-prevalence baseline (**0.00093963**). ROC-AUC was **0.5000**. The selected tree assigned the *same score to every one of the 743,909 validation rows*. It learned no ranking signal. Consequently, any “top 1%” or “top 10%” result is determined only by the arbitrary transaction-ID tie-break, not by model risk. There is no meaningful precision threshold to use.

## Decision and next work

The V4 behavioral features did not improve model discrimination. The full review-budget figures and their tie bounds are preserved in the aggregate JSON, but the selected model's complete tie means those figures are not operational performance. Taken with V2 and V3, this makes further threshold changes or another conventional model unlikely to produce a trustworthy real-time score from the currently allowed columns alone. **Do not deploy or describe this model as usable for real-time fraud decisions.**

The most useful next evidence is not another model sweep on the same validation period. A separate [read-only validation diagnostic](fraud_score_validation_diagnostic_report.md) found 259 of 259 transactions with `fraud_score >= 50` labeled fraud, but this is not safe to use until the score's timing and source are verified. Obtain `SELECT` on `workspace.bank_silver.digital_events` and run the existing prior-event coverage audit. Also ask the data owner to confirm how `is_fraud` and `fraud_score` were created, when labels mature, and which transaction fields exist before authorization. Project notes explicitly say earlier dummy labels were random; whether the current supplied labels are independently meaningful remains unverified. A model cannot learn a stable real-time pattern if the target is random or determined by information that only appears after the transaction.

Several experiments have already used the July–December 2025 validation period. Treat these metrics as exploratory, not unbiased final performance. Keep the 2026 final-test period closed until the target is verified, useful signals are available, and a promotion rule is written down. If those conditions are met, use a fresh temporal backtest, then evaluate the final test once. A real-time deployment additionally needs an online feature-state design and serving permissions; neither is part of this experiment.
