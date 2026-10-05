# OpenCode handoff — experimental fraud model integration

Branch: `feat/diego-ml-fraud-features`. This document records the verified current
state of the repository as of 2026-10-05, the delivered integration, the
remaining work, and completed digital-history experiments. It contains no secrets, tokens,
credentials, or customer records.

## Verified current state

- The original integration was pushed and merged through [PR #135](https://github.com/pqbas/factored-hackathon-2026-zenit/pull/135); the remote feature branch was retained.
- Subsequent V8/V9 research and report commits are local on `feat/diego-ml-fraud-features`; no new push or merge was performed during these experiments.
- V8 source commit is `8207cfb`; V9 source commit is `1379d91`. Exact code hashes are saved with each run's aggregate evidence. Use `git status` and `git log` for the latest documentation commit instead of treating an earlier fixed HEAD as current.

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

- Original integration verification: agent 462, frontend 133, backend 180, ML 66 tests passed (841 total). After V8/V9 changes, the ML suite was rerun with 75 passing tests. Application suites were not rerun because no application code or artifact changed in this iteration.
- Production container builds passed; native inference and application import passed inside the agent container.
- Real deployed inference and cross-customer rejection were verified.
- The complete browser workflow passed (test reference `ML-E2E-20261005-023840`): customer login, complaint submission, customer confirmation, advisor login, opening the case, and prediction persistence after reload, with zero browser page errors. The test complaint remains in `human_queue`; it was not claimed, resolved, or deleted.

## Integration PR description (historical reference; already merged)

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

### A. Git delivery

1. Original integration delivery is complete through PR #135; retain its remote branch.
2. V8/V9 research commits and evidence are local. Publishing them is a separate delivery step; no rejected candidate should replace the runtime model.

### B. Operational follow-up

1. Data freshness: document and alert on the existing manually refreshed Lakebase mirror.
2. Monitoring: emit metrics/alerting for inference availability, model-artifact integrity failures, and unavailable-result rates.
3. Failure behavior: confirm graceful degradation when features, tables, or the artifact are unavailable.
4. Measured latency under representative load: the current synchronous inference is not benchmarked under load.

### C. Predictive improvement

1. Label provenance: confirm whether organizer fraud labels are independent of post-transaction outcomes.
2. Feature availability at decision time: verify each signal exists before authorization.
3. Obtain a new verified source of predictive information or authoritative label-generation details. The newly readable digital-event source has now been tested in V8/V9 without useful improvement.
4. Investigate recorded source-date inconsistencies before treating current dimensions as historical feature revisions.

## Completed bounded digital experiments

- **Access:** explicitly authorized `pqbas` profile, effective principal `pcubasm1@gmail.com`, can read digital events. This does not prove personal/service-principal grants changed; no grants were applied.
- **V8:** three CatBoost candidates on conservative seven-day digital history; run `1045349607856484`, task `427959278571538`, MLflow `4bad27824082499e8675958c1e0bf56f`. About 6% coverage; precision 0.054267% (4 / 7,371). Rejected. Its V7 replay used Silver conversions and is an input sensitivity comparator.
- **V9:** two candidates on thirty-/ninety-day activity and Gold inputs; run `1073504604612583`, task `725203113732658`, MLflow `8d10d8910ac349a0ab65545dbe532469`. Coverage 55.53%; precision 0.051190% (4 / 7,814), ROC-AUC 0.499097. Native V7 Gold replay matches the original manifest exactly. Rejected.
- **Protocol:** fit before January 2025; select on January–March; freeze thresholds on April–June; evaluate July–December. Development periods are exploratory; final 2026 test remains sealed. Python/Spark timing fixtures passed and source cardinalities reconciled.
- **Timing:** events use a conservative proxy `max(event_date, midnight after process_date)` before T; this does not prove actual arrival availability. Millions of events have missing customer IDs or inconsistent processing dates. About one quarter of pre-July transactions precede recorded registration/product opening.
- **Runtime:** V7 remains deployed on image `00539622`; no new AWS deployment, source-table change, schema/grant change or model promotion occurred. Both Databricks experiment tasks ended SUCCESS.
- **Reproduction:** `python ml/render_v8.py --phase 8|9 --output /tmp/notebook.py` renders a self-contained source notebook. Use the corresponding notebook and `ml/jobs/train_v8.json` or `train_v9.json`. Do not rerun broad searches on the same inspected data without a distinct justified hypothesis.

## References

- `ml/README.md`, `ml/spec/roadmap.md`, `ml/spec/28-09-26-fraud-model/executable_predictions.md`
- `ml/reports/2026-10-05/executable_predictions_report.md`
- `ml/reports/2026-10-05/aws_predictions_report.md`
- `ml/reports/2026-10-05/web_end_to_end_report.md` and `web_end_to_end_data.json`
- `ml/reports/2026-10-05/digital_access_and_quality_report.md`
- `ml/reports/2026-10-05/dimension_timing_audit_report.md`
- `ml/reports/2026-10-05/training_v8_digital_report.md` and `training_v8_digital_data.json`
- `ml/reports/2026-10-05/training_v9_digital_report.md` and `training_v9_digital_data.json`
- `agent/configs/fraud-model/manifest.json`
- `LOCAL_MAIN_INTEGRATION.md`
