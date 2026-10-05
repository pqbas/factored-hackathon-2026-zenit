# V6: research-backed advanced challengers

Status: **completed successfully 2026-10-04, not promoted**, one-time run `482234883980497`. Selected enhanced XGBoost reached later ROC-AUC 0.5023 and precision 0.106% (8 fraud labels among 7,536 alerts) at its frozen approximately 1% review threshold, worse than V5 at that point. Supported 20%/50%/80% precision targets were infeasible. See the [execution report](../../reports/2026-10-04/training_v6_advanced_report.md). Database source tables and final-test labels remain untouched.

## Research and applicability

The ULB authors' [reproducible fraud handbook ensemble comparison](https://fraud-detection-handbook.github.io/fraud-detection-handbook/Chapter_6_ImbalancedLearning/Ensembling.html) studies balanced bagging, balanced forests, and weighted XGBoost in fraud detection. Its experiments motivate trying training-set resampling at individual-tree level and cost-sensitive boosting. Its illustrative and fraud experiments contain learnable feature-label structure; their published metrics do not predict results for this synthetic banking dataset. The handbook also demonstrates that resampling can improve one metric while not improving average precision; it is not a guaranteed correction.

[BalancedRandomForestClassifier documentation](https://imbalanced-learn.org/stable/references/generated/imblearn.ensemble.BalancedRandomForestClassifier.html) describes per-tree resampling. This differs from V5's one fixed negative sample and positive class weighting. [XGBoost parameters](https://xgboost.readthedocs.io/en/stable/parameter.html) support histogram-based boosting and positive-class weighting. V6 tests these specific mechanisms under fixed temporal boundaries, not an open-ended parameter sweep.

The earlier [Databricks financial-fraud reference notebook](https://databricks-prod-cloudfront.cloud.databricks.com/public/4027ec902e239c93eaaa8714f173bcfc/3620158951254961/2005436742289144/2171944558356615/latest.html) uses a different simulated mobile-money schema, including before/after origin and destination balances, and constructs a rule-based fraud outcome. Such after-transaction fields and the rule's target definition do not establish prospective performance for the organizer's `is_fraud`. We retain the supplied target and do not manufacture a replacement label to obtain a high percentage.

An [Isolation Forest](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.IsolationForest.html) candidate tests whether unusual behavior ranks labeled fraud. A short path indicates novelty, not fraud, and the experiment may reject this candidate. No autoencoder or neural network is required to test this hypothesis first.

## Candidate design

| Candidate | Mechanism | Purpose |
|---|---|---|
| A0 | Weighted CPU XGBoost on V4 base fields with common preprocessing | New boosting comparator |
| A1 | Same XGBoost settings plus seven causal features | Paired feature ablation |
| A2 | Balanced Random Forest on enhanced features | Resample each tree; test minority sensitivity and broader coverage |
| A3 | Isolation Forest trained on known normal fit rows | Test label-compatible novelty ranking |
| A4 | Equal-weight rank blend of A1/A2/A3 | Test complementary ranking without learning ensemble weights on evaluation |
| Null control | Same enhanced XGBoost with shuffled fit label/weight pairs | Diagnostic only; never eligible for selection or deployment |

A0/A1 have up to 400 boosting iterations, depth 5, learning rate 0.05, minimum child weight 10, L2 regularization 20, 0.8 row/column subsampling, positive-class weight 20, and 40-round early stopping. Selection uses exact unweighted scikit-learn average precision; XGBoost's native `aucpr` controls early stopping and is not claimed to have the same definition.

A2 uses 160 trees, depth 10, minimum leaf size 5, a minority/majority sampling ratio of 0.2, replacement, and no outer bootstrap. Its resampling changes training prevalence, so outputs are risk scores, not calibrated probabilities. A3 uses 100 isolation trees, 256 rows per tree, and a seeded sample of up to 20,000 genuine-normal fit rows. Negative anomaly scores are reversed to make larger values more unusual.

A4 maps each member's raw score to an empirical percentile using a common seeded sample of up to 20,000 fit negatives, then averages the percentiles with fixed equal weights. Evaluation rows do not define the reference distribution. Score ties retain equal ranks. This is a complementary-ranking hypothesis, not an assurance that combining weak models creates useful signal.

The null control permutes fit labels together with inverse-inclusion weights, preserving their pairing and class counts while breaking their association with features. Selection-period labels remain genuine. The control shares the XGBoost configuration and early-stopping convention with A1. Similar true/control performance weakens the evidence for learned signal; one control run does not prove labels are random. The sampled fit cohort remains the original label-stratified cohort, so the control is conditional on that sampling design.

## New feature contract

| Field | Definition |
|---|---|
| `product_tx_count_5m` | Product activity in `[T-5m,T)` |
| `product_tx_count_1h` | Product activity in `[T-1h,T)` |
| `product_same_currency_abs_amount_sum_1h` | Earlier same-product/same-currency absolute amount sum; null without eligible rows |
| `customer_same_currency_std_amount_30d` | Sample standard deviation of earlier absolute amounts in the same currency |
| `customer_amount_zscore_30d` | Current absolute amount deviation from prior mean/std; null with fewer than five amounts or zero variance |
| `customer_country_tx_count_30d` | Prior customer transactions in current country |
| `customer_new_country_30d` | No matching-country transaction observed in that window; not a claim of complete history |

All windows exclude current/same-time/future rows and include their lower boundary. Currency-specific sums/amount deviations never mix USD/COP/ARS scales. Product/customer IDs are intermediate aggregation keys, not predictors. Null IDs have transaction-specific fallback keys rather than sharing a history bucket. Current country and exchange-rate field availability at authorization still need provenance verification, as in earlier experiments; results are retrospective event-time evidence only.

The enhanced frame is joined by transaction ID to the unchanged V4 feature definitions. Cardinality checks must match original period counts. A Spark fixture compares all seven features with an independent small Python oracle, including mixed currency, same-time rows, exact lower boundaries, and a sealed-test row. Fit-only medians, explicit missingness indicators, and one-hot categorical encoding are common across candidates. Unknown later categories are ignored by the fitted encoder, not used to refit a vocabulary.

## Temporal protocol and resource limits

Use the V5 boundaries: fit before 2025-01-01; select/early-stop on January–March; select operational thresholds on April–June; inspect July–December only after selecting the candidate and freezing thresholds. These periods were exposed in earlier model development. This is exploratory iteration, not a newly independent holdout. The 2026 final test stays sealed.

Retain all fit positives and the same deterministic 10% negative hash sample. A0/A1 and the control use inverse-inclusion weights, followed by explicit positive weighting. A2 uses per-tree class resampling without claiming a probability-preserving objective. A3 learns only sampled normal fit behavior. Evaluation retains every eligible row and natural prevalence.

Five estimator fits plus one fixed blend are bounded by a 3,600-second run timeout, a 3,000-second candidate-loop guard, and four CPU threads per supervised estimator. Before driver collection, estimate memory using a bounded pilot and a factor of three; require the estimate to fit below 45% of physical/cgroup headroom and 2 GiB. This estimate is a safeguard, not a measured native-estimator peak. Dependencies: `xgboost-cpu==2.1.4`, `imbalanced-learn==0.14.0`, `scikit-learn==1.6.1`, in Serverless environment v4. Zero task retries are requested; serverless can still perform an automatic retry, as observed in V5.

## Evaluation, gate, and integration

Select among A0–A4 by January–March average precision; exclude the null control. Freeze threshold curves on April–June. Evaluate supported precision scenarios of 20%, 50%, and 80%, requiring at least 100 alerts, recall at least 20%, and alert rate at most 1%. Empty alerts have undefined precision. Show later precision, recall, TP/FP/FN/TN, actual alert rates, score diversity, and monthly denominators. Use the same metric definition for this comparison and V5; earlier Spark areaUnderPR is a separate metric.

Even a gain over V5 needs verified label generation and arrival/field availability before prospective use. A candidate clearing usefulness criteria would require a frozen final one-time test and explicit serving/freshness design. Otherwise retain an unvalidated integration contract and human workflow; do not expose a numerical score as a verified fraud probability or assert that a person committed fraud.

Source/notebook: [train_v6.py](../../train_v6.py), [10_advanced_challenger.ipynb](../../notebooks/10_advanced_challenger.ipynb), [run request](../../jobs/train_v6.json). Only shared notebook sources and aggregate MLflow experiments are created/updated; no source table, scoring table, schema, UC function, registered model, or endpoint is written by this run. Registration and platform deployment are contingent on evidence and an identified target.
