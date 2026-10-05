# V8: newly accessible digital-history experiment

Status: implementation and execution in progress, 2026-10-05.

## Hypothesis and authorization

The user authorized autonomous model improvement using the available accounts.
The `pqbas` CLI profile authenticates as `pcubasm1@gmail.com` and now successfully
reads `workspace.bank_silver.digital_events`; previous experiments used a
principal lacking this access. This does not prove that the personal profile or
the deployed application's service identity received new grants.

The new hypothesis is that a customer's earlier digital activity adds useful
ranking signal to the transaction/history predictors. Frontend roles and
Databricks grants are distinct. Source tables and permissions are read only.

## Audit findings and timing

Before July 2025 there are 10,529,594 digital events, covering 149,792 identified
customers. 2,526,222 events have no customer and cannot match transaction history.
Only 134 events are at midnight; timestamps contain sub-day information.
2,646,273 events have a processing date earlier than the event date. The feed's
actual delivery semantics and the organizer's label provenance are unverified.

Use a conservative availability proxy:
`max(event_date, midnight after process_date)`. Missing process dates are excluded.
Features use the same customer's proxy times in `[T-duration, T)`, excluding
same-time/future events. This is a retrospective timing sensitivity analysis;
the proxy does not establish real production availability.

Transactions remain pinned to Delta v1. Events are pinned to Delta v4, whose
history includes optimization/vacuum operations; older event files may no longer
be readable. No optimization or vacuum is initiated by this experiment.

## Features

Add earlier event counts over one hour, 24 hours and seven days; login/error
counts; time since latest eligible event; its event age, mobile indicator,
duration, and country mismatch; latest event type/category/platform/browser/channel.
All latest-event features share deterministic tie handling and a seven-day bound.
IP addresses, customer/session/event IDs, URLs, current fraud scores, outcomes,
transaction status and complaint text are excluded from predictors.

## Bounded candidates and evaluation

Compare three CatBoost candidates: full-fit natural class weight, full-fit
positive weight 20, and recent-fit natural class weight. Fit-only medians and
native categorical handling are used. All fit positives and a deterministic
10% negative sample are retained, with inverse-inclusion weights. Recent fit
starts July 2024. At most 350 trees, depth 6, four CPU threads and 40-round early
stopping are allowed. The task timeout is one hour; the candidate-loop guard is
3,000 seconds. No unbounded hyperparameter search is planned.

Fit before January 2025; select/early-stop on January–March; freeze thresholds on
April–June; evaluate the selected candidate on July–December. These development
periods were inspected previously and are exploratory. 2026 test data remains
sealed. Every evaluated row retains natural prevalence. The deployed V7 binary
and its frozen threshold are evaluated on the same later rows; baseline vectors
are checked against the existing scalar serving contract.

Report average precision, ROC-AUC, precision/recall, confusion counts, workload,
monthly support, coverage, and feature importance. A supported ranking gain
requires AP at least three times prevalence and 1.5 times V7 AP, precision at
least 1% and twice V7 precision, recall at least 10%, at least 100 alerts, and
ROC-AUC at least 0.60 at the threshold chosen for a 1% review budget. Clearing
this exploratory gate requires an independent final test and serving-feature
verification; it does not enable automatic decisions or establish probability
calibration. The existing deployed model remains until evidence justifies change.

Driver collections are bounded by a pilot memory estimate, 45% of available
memory and a 2 GiB ceiling. Later evaluation is collected one month at a time.
Only aggregate evidence and native model artifacts leave the Databricks job.

Temporal evaluation follows the [Fraud Detection Handbook's validation
strategies](https://fraud-detection-handbook.github.io/fraud-detection-handbook/Chapter_5_ModelValidationAndSelection/ValidationStrategies.html).
This source motivates future-period evaluation; its published results are not
performance promises for the supplied synthetic dataset.
