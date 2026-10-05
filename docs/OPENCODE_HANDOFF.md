# OpenCode handoff — experimental fraud model integration

Branch: `feat/diego-ml-fraud-features`. This document records the verified current
state of the repository as of 2026-10-05, the local PR draft, the prioritized
remaining work, and a bounded next experiment. It contains no secrets, tokens,
credentials, or customer records.

## Verified current state

- Working tree is clean. `HEAD` is `3e7a3e1` (`docs(ml): verify persisted web-to-advisor predictions`).
- The branch includes `origin/main` through `20e0e98`; no Git push, PR, or merge has been performed.
- All commits remain local on `feat/diego-ml-fraud-features`.

### Delivered application

- The original AWS application is deployed and was updated in place; no separate chatbot, service, or frontend was created.
  - Web/backend: `https://wzmpasrvja.us-west-2.awsapprunner.com`
  - Agent: `https://qidmxa8upf.us-west-2.awsapprunner.com`
  - App Runner services: `bank-assistant-back` and `bank-assistant-agent`, both on image tag `00539622`.
- Runtime configuration, authentication, and existing service identities were preserved.

### Executable model

- Model: `v7_gold_lakebase_c3`, CatBoost 1.2.8. Native artifact `model.cbm` (41,248 bytes) plus `manifest.json` under `agent/configs/fraud-model/`.
- Training: `ml/train_serving.py`, `ml/build_serving_notebook.py`, `ml/notebooks/11_executable_fraud_predictions.py`, job `ml/jobs/train_serving.json`.
- Databricks notebook `/Shared/fraud-eda/11_executable_fraud_predictions`; run `1029482291508951`; task `1105616283771884`; MLflow run `663c44e0c3de40718830f5362dce5a9b`; source `workspace.bank_gold.customer_transactions` Delta version 1.
- Uses serving-compatible causal features without unavailable geographic coordinates. Fitted medians and feature order travel with the artifact. Native save/reload prediction error was zero.
- Frozen threshold `0.042594873940121264`.

### Serving and UI invariants (always preserved)

- `score_type: uncalibrated_model_output`
- `review_required: true`
- `automatic_decisions_enabled: false`
- Customer identity is bound from the authenticated session, outside LLM-generated arguments.
- The tool reads an owned transaction and strictly earlier customer history from existing Lakebase tables, producing a real native model score and a frozen-threshold classification.
- Invalid artifacts, unavailable data, or unauthorized lookups return `unavailable`, never an invented score.
- The advisor card shows an experimental index out of 100 and whether the threshold was exceeded.

### Measured V7 validation (July–December 2025)

- Transactions: 743,909; fraud labels: 699.
- Alerts: 7,224; true positives: 6; false positives: 7,218.
- Precision: 0.083056%; recall: 0.858369%; ROC-AUC: 0.496829.
- V7 enables executable inference but does not improve on V5. These are weak results and are reported without substitution. Final-test labels remain unopened.

### Verification already completed

- Agent: 462 tests passed. Frontend: 133 passed. Backend: 180 passed. ML: 66 passed (841 total).
- Production container builds passed; native inference and application import passed inside the agent container.
- Real deployed inference and cross-customer rejection were verified.
- The complete browser workflow passed (test reference `ML-E2E-20261005-023840`): customer login, complaint submission, customer confirmation, advisor login, opening the case, and prediction persistence after reload, with zero browser page errors. The test complaint remains in `human_queue`; it was not claimed, resolved, or deleted.

## Local PR draft (do not publish yet)

**Title:** Integrate executable experimental fraud model into the complaint-to-advisor workflow

**Body:**

> ## Summary
> - Adds a serving-compatible native CatBoost V7 artifact and an inference path that scores an owned transaction using strictly earlier customer history from existing Lakebase tables.
> - Binds customer identity from the authenticated session, outside LLM-generated arguments; unauthorized or ambiguous lookups return `unavailable`, never an invented score.
> - Preserves the invariants `score_type: uncalibrated_model_output`, `review_required: true`, and `automatic_decisions_enabled: false` throughout.
> - Renders an experimental advisor index (0–100) and the frozen-threshold result in the existing advisor case card; no database migration is required.
> - Documents the full ML pipeline (Phases 0–7, exploratory V1–V7) with evidence reports.
>
> ## Validation
> - Agent 462, frontend 133, backend 180, ML 66 tests passed (841 total).
> - Production containers build; native inference and application import verified in the agent container.
> - Deployed to the existing AWS services (image `00539622`); real inference and cross-customer rejection verified.
> - Full browser end-to-end flow passed, including persistence after reload.
>
> ## Model limitations (read before review)
> - Validation precision 0.083056%, recall 0.858369%, ROC-AUC 0.496829. No improvement over V5.
> - The model has not demonstrated utility for automatic fraud decisions; human review remains mandatory.
> - The experimental index is an uncalibrated model output, not a validated fraud probability. A positive flag does not confirm fraud; a negative flag does not establish innocence.

## Prioritized remaining work

### A. Git delivery (requires authorization)

1. Review this branch diff against `origin/main`.
2. Authorized push and opening of the PR above.
3. Merge (only after explicit authorization).

### B. Operational follow-up

1. Data freshness: document and alert on the existing manually refreshed Lakebase mirror.
2. Monitoring: emit metrics/alerting for inference availability, model-artifact integrity failures, and unavailable-result rates.
3. Failure behavior: confirm graceful degradation when features, tables, or the artifact are unavailable.
4. Measured latency under representative load: the current synchronous inference is not benchmarked under load.

### C. Predictive improvement (do not start before A/B hygiene)

1. Label provenance: confirm whether organizer fraud labels are independent of post-transaction outcomes.
2. Feature availability at decision time: verify each signal exists before authorization.
3. New independently useful signals (e.g., digital events once read access is confirmed for the production identity).

## Bounded next experiment (proposal only)

- **Hypothesis:** A single new, decision-time-available signal provides ranking signal beyond V7, moving later-period ROC-AUC above V7's `0.496829` at the same frozen ~1% review budget.
- **Scope:** one candidate signal, one model family (CatBoost, V7 config), no new parameter sweep, no label changes.
- **Pre-requisite:** confirm `workspace.bank_silver.digital_events` `SELECT` under the production identity (earlier access failures were under a personal profile, not the production principal). Do not grant permissions automatically.
- **Evaluation:** later-period ROC-AUC and frozen-threshold precision/recal, compared directly to V7. Final-test labels stay sealed.
- **Gate:** promote only if the signal is available before authorization, independent of the label, and materially improves the measured metrics; otherwise record the negative result and stop.

## References

- `ml/README.md`, `ml/spec/roadmap.md`, `ml/spec/28-09-26-fraud-model/executable_predictions.md`
- `ml/reports/2026-10-05/executable_predictions_report.md`
- `ml/reports/2026-10-05/aws_predictions_report.md`
- `ml/reports/2026-10-05/web_end_to_end_report.md` and `web_end_to_end_data.json`
- `agent/configs/fraud-model/manifest.json`
- `LOCAL_MAIN_INTEGRATION.md`
