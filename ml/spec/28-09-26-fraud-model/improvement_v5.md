# V5 improvement proposal: diagnose capacity, then add independent signals

Status: proposed on 2026-10-03. No V5 model has been trained or promoted. Source data, schemas, functions, and serving resources are not changed by this proposal.

## Decision and evidence

The next useful experiment has two branches: a bounded capacity/encoding diagnostic using permitted transaction fields, followed by a digital-event challenger if read access and temporal availability are established. A higher precision is an objective, not an expected result.

- V2 Random Forest precision was 0.161% at a 1% review rate (12 fraud labels among 7,440 alerts). Validation prevalence was 0.094%.
- V3 added transaction category and coarse coordinates without improving ranking. V4 added prior merchant/location familiarity; its selected tree assigned a constant score to validation.
- The executed trees required at least 1,000 rows per leaf; the forest had 20 trees and depth 6. These conservative configurations leave underfitting as an untested hypothesis. They do not establish that all classifiers or all interactions must fail.
- Conversely, near-chance validation ranking across several feature sets is serious negative evidence. Changing an algorithm, balancing classes, or adjusting a threshold cannot guarantee useful precision.
- Notes about random labels describe earlier dummy data. Current label generation is **unknown**, not established as random.
- `fraud_score >= 50` matched 259/259 fraud labels on previously inspected validation. This is a provenance diagnostic, not evidence of clean model performance. It remains excluded until its independence and availability before authorization are confirmed.
- A new read-only access check on 2026-10-03 again failed with `INSUFFICIENT_PERMISSIONS` on `workspace.bank_silver.digital_events` (statement `01f1bf47-4b68-10b9-b169-fb926ec2882e`). No digital-event measurements were obtained.

Related evidence: [review curve](../../reports/2026-10-03/review_budget_curve_report.md), [V3](../../reports/2026-10-03/training_v3_feature_challenger_report.md), [V4](../../reports/2026-10-03/training_v4_behavioral_challenger_report.md), and [score provenance](../../reports/2026-10-03/fraud_score_validation_diagnostic_report.md).

## Step 1: establish the target and decision time

Obtain these answers from the supplied dataset's owner before interpreting any candidate as a prospective fraud detector:

1. How is `is_fraud` generated? Is it independent random assignment, a synthetic rule, an investigation result, or another source? Request the generator/label rules or a precise definition.
2. When is the label known, when is it final, and can later corrections alter it? For historical backtests, include only labels mature at each training cutoff; if maturity cannot be reconstructed, explicitly limit the experiment to retrospective synthetic-data evaluation.
3. Who produces `fraud_score`, from which inputs, and at what time? Is it independent of the label and available before the proposed action?
4. Which fields exist before authorization? In particular, confirm transaction category, location, exchange-rate enrichment, and digital-event arrival times.

Keep `fraud_score`, `is_fraud`, final transaction status, response codes, balances from current snapshots, and subsequent complaints out of inference features. Labels may be read for training/evaluation only. If the intended product is investigation of an existing dispute instead of authorization, define that different decision time and dataset explicitly; do not transfer pre-authorization performance claims to it.

## Step 2: training-only signal and capacity audit

Run [08_train_signal_audit.ipynb](../../notebooks/08_train_signal_audit.ipynb). It reads transaction Delta version 1 strictly before 2025-07-01 and returns counts by category/hour/month and internal period. It neither trains a model nor inspects validation or final test. Marginal rates are diagnostic: similar rates do not rule out interactions, and isolated high rates in small groups do not prove useful signal.

Instrument the next training run to report train and later-period ranking metrics, score diversity, tree/leaf size where applicable, feature missingness/variance, unknown-category rates, and convergence. Check that engineered features vary and that prediction columns actually refer to the positive class. A constant train score suggests a capacity, feature, or implementation issue; excellent train performance with near-chance later ranking suggests overfitting, shift, or unstable labels. These are hypotheses to investigate, not automatic diagnoses.

Add explicit numeric missingness flags and history-support flags. Preserve the difference between no observed history and an unknown/unavailable event feed. Keep the existing feature definitions as a comparator; changing preprocessing and the model simultaneously requires an ablation to attribute any improvement.

## Step 3: bounded model challenger without waiting for digital access

Use CatBoost on numerical and categorical transaction/history features as a capacity/encoding challenger. This is a new dependency and model family; it is not already trained. Its native categorical handling is supported by the [official documentation](https://catboost.ai/docs/en/features/categorical-features), and its early-stopping options are documented in [parameter tuning](https://catboost.ai/docs/en/concepts/parameter-tuning). Neither capability implies an improvement on this dataset.

Proposed first-pass budget: at most four sequential fits, CPU only, up to 500 boosting iterations per fit, early stopping after 50 rounds without improvement. Record a runtime cap and driver-memory estimate before starting. Begin with depth 6, learning rate 0.05, L2 leaf regularization 10, seed 42. Log actual effective iterations and all settings.

| Candidate | Features | Positive-class weight | Purpose |
|---|---|---:|---|
| C0 | V4 features; categorical columns passed natively | 1 | Isolate the model/encoding change |
| C1 | Same as C0 | 20 | Compare moderate cost weighting |
| C2 | Same as C0 | 100 | Test stronger weighting without assuming a prevalence ratio is optimal |
| C3 | Same as the selected C0–C2 configuration plus missingness/history-support flags | Fixed from earlier selection | Test the incremental value of missingness information |

Do not apply weights or sampling to evaluation metrics. Class weighting can distort probabilities, so expose a risk score rather than a calibrated fraud percentage. Run a fixed-seed shuffled-training-label negative control only if a substantial gain needs verification; preserve evaluation labels and prevalence. Similar control and true-label results would weaken the signal claim, not prove labels are random.

Spark builds point-in-time features and aggregates; model fitting can use bounded in-memory data only after a measured memory check. Do not collect millions of rows to a driver without that check. If negative undersampling is needed for training, retain all training positives, document sampling/inclusion weights, and recompute any chosen class-weight scheme for that design. Never undersample evaluation. Do not compare a sampled-training model as if it used the full original training population.

## Step 4: digital-event features, conditional on access and coverage

Required read grant for `diegoalonsorv02@gmail.com`:

```sql
GRANT SELECT ON TABLE workspace.bank_silver.digital_events
TO `diegoalonsorv02@gmail.com`;
```

This is an instruction for an authorized owner, **not a command executed by this work**. No schema creation or source-table write is needed for the audit. Run the prepared [coverage notebook](../../notebooks/04_digital_event_coverage.ipynb), pin the event-table Delta version separately, inspect actual event types, and establish coverage and event-arrival semantics before constructing features.

| Candidate feature | Available source | Eligibility and interpretation |
|---|---|---|
| Event counts over prior 5 minutes / 1 hour / 24 hours | `event_date`, `customer_id` | Only earlier events known by decision time; not proof of complete activity |
| Seconds since last observed event | `event_date` | Null when no eligible history is observed |
| Distinct observed sessions in prior hour | `session_id` | Aggregate only; session ID is not a predictor |
| Recent failed login count | `event_type`, `event_category`, `action` | Implement only if failure semantics actually exist in the observed values |
| New platform/browser combination in prior 30 days | `platform`, `browser`, `is_mobile` | A coarse environment proxy; the schema does not provide a reliable device ID |
| Last prior IP country differs from transaction country | `ip_country`, `transaction_country` | Only when both are present; travel/VPN can explain differences |
| Prior session geography changes | `ip_country`, `ip_city` | Require sufficient non-null history; do not classify missing geography as a change |

Use windows `[T-duration, T)` and exclude same-time events. Event timestamps alone are insufficient when delivery is late: require a usable arrival/availability cutoff. The dataset has a date-only `process_date`; it may support a conservative previous-day availability rule, but it cannot establish minute-level arrival latency. If no more precise arrival timestamp exists, label the analysis as an event-time retrospective backtest rather than real-time evidence.

Aggregate before joining and prove one output row per transaction. Do not build an unrestricted event-by-transaction range join or an expanding session-ID set over the full dataset. Do not feed raw IP, session/customer IDs, or free-text page URLs to the predictor. Compare C0–C3's selected transaction-only candidate with the same model plus verified digital features, on both the full population and the covered subset, preserving denominators. A covered-subset improvement is not full-population performance.

## Step 5: temporal evaluation and precision objective

Several models already used July–December 2025 validation, so it is exploratory and cannot become a fresh holdout merely by renaming it. Keep the 2026 final test closed during development.

Proposed internal partitioning within the original training period, contingent on label support:

| Purpose | Interval |
|---|---|
| Fit model and learn preprocessing | Before 2025-01-01 |
| Select candidate / stop boosting | [2025-01-01, 2025-04-01) |
| Select operational threshold | [2025-04-01, 2025-07-01) |
| Exploratory comparability report | [2025-07-01, 2026-01-01), previously inspected |
| Final one-time evaluation | 2026 onward, only after a frozen candidate and acceptance rule |

Earlier models trained on the internal periods. These splits improve separation of future V5 operations but do not erase earlier exposure or create independent new evidence. Report counts and label maturity before committing to boundaries. Keep the chosen model fit cutoff and threshold fixed when evaluating later periods; refitting after threshold selection is a different candidate requiring its own evaluation.

Compute one common ranking metric on identical cohorts for all contenders. Spark areaUnderPR and scikit-learn average precision are not interchangeable; recompute comparators under the selected definition or report each separately. Report precision, recall, alert rate, TP/FP/FN/TN, score ties, and month/channel/country denominators. Show uncertainty with customer-level or time-block resampling and explain small-positive instability.

Evaluate target-precision scenarios of **20%, 50%, and 80%**, always with recall, alert count, and review cost. These are planning scenarios, not achieved performance or approved bank policy. Choose a threshold using only its designated period, then assess the frozen threshold later. If no threshold satisfies a scenario with meaningful recall and adequate support, report that scenario as infeasible. An empty alert set has undefined precision; a single correct alert is insufficient support.

For a concrete proposed high-precision gate to discuss with the product owner: **precision at least 80%, recall at least 20%, alert rate at most 1%, and at least 100 evaluated alerts**, with uncertainty and month-level stability reported. This ambitious gate is not approved policy and may be unattainable. On the existing validation cohort, 20% recall would require about 140 of 699 fraud labels; at 80% precision, those 140 could produce at most 175 alerts. Such a gate demands a much stronger ranking than current models provide.

Threshold changes trade precision against recall; they do not improve ranking. The [scikit-learn threshold guide](https://scikit-learn.org/stable/modules/classification_threshold.html) documents this distinction and warns against fitting a model and tuning its threshold on the same rows.

## Integration after evidence

A model passing a frozen gate can be packaged with the exact feature contract and model version for backend scoring. Real-time use also requires reproducible online feature state, freshness/availability checks, and measured end-to-end latency. Offline ranking metrics do not demonstrate online latency.

Until promotion, an integration response should communicate `model_status: unvalidated`, a nullable `risk_score`, and a reason such as `NO_PROMOTED_MODEL`. Human triage can still handle customer-reported unrecognized charges. A unavailable score must not be interpreted as a safe transaction, and a risk score must not assert that a person committed fraud. Deterministic policy decides routing outside LLM-generated text.

This proposal creates no database objects, score tables, model registry entries, or serving endpoint. Execute isolated read-only diagnostics first; keep source data unchanged. Prepare and review any later required resource changes separately.
