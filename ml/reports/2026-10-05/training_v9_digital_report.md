# V9 longer digital history: completed, rejected

Two additional CatBoost candidates were trained and evaluated after V8's low
seven-day coverage finding. Ninety-day coverage improved substantially, but
useful predictive precision did not. The existing AWS model remains V7.

## Execution

- Shared notebook: `/Shared/fraud-eda/13_long_digital_history_challenger`.
- Databricks run: [1073504604612583](https://dbc-184e79fe-04dc.cloud.databricks.com/?o=7474647867986650#job/657244608497685/run/1073504604612583).
- Task `725203113732658`: SUCCESS.
- MLflow run: `8d10d8910ac349a0ab65545dbe532469`.
- Source commit `1379d91`; exact source hashes and metrics are in the
  [aggregate evidence](training_v9_digital_data.json).
- Trainer runtime: 539.55 seconds. No monetary cost was measured.
- Sources: Gold transactions Delta v1 and Silver digital events Delta v4.
- Independent Python/Spark ninety-day boundary/delivery fixture passed.
- Local ML suite: 75 tests passed after adding the new boundary tests.
- No source tables, schemas, grants, AWS services or deployed artifacts changed.

## Coverage and candidate selection

Latest-event history extends to ninety days, with added thirty-/ninety-day
activity and ninety-day login/error counts. The conservative availability proxy
remains `max(event_date, midnight after process_date)`. Source timing and label
provenance remain unverified; this does not establish prospective availability.

| Period | Total transactions | With ninety-day history | Covered fraud labels |
| --- | ---: | ---: | ---: |
| Fit | 2,271,707 | 1,171,426 | 1,197 |
| Selection | 356,361 | 190,107 | 188 |
| Operating threshold | 366,529 | 199,768 | 189 |
| Later validation | 743,909 | 413,088 | 404 |

Later coverage increased from V8's approximately 6.03% to **55.53%**. Among
covered later transactions, average counts were 0.91 / 3.90 / 11.78 events in
seven / thirty / ninety days. More coverage did not create predictive utility.

Both candidates fit the same deterministic 229,760-row cohort with all 2,296
fit positives and a 10% negative sample corrected by inverse-inclusion weights.

| Candidate | Trees retained | Selection average precision | Selection ROC-AUC |
| --- | ---: | ---: | ---: |
| L0 natural class weight | 4 | 0.00107078 | 0.520315 |
| L1 positive class weight 20 | 3 | 0.00113559 | 0.532318 |

L1 was selected on January–March average precision, not on later performance.
Its threshold `0.36574689032665736` was frozen on April–June with a 1% review
budget. Early stopping used CatBoost PRAUC; reported average precision uses
scikit-learn's implementation. These definitions are not asserted identical.

## Gold-consistent baseline replay and later results

The original native V7 binary, fitted medians and frozen threshold were replayed
on exactly the same Gold transaction cohort. Rows, labels and all confusion
counts match the V7 manifest; AP and ROC-AUC also reproduce the original values.
This removes V8's Silver/Gold exchange-conversion mismatch.

| July–December 2025 measure | Selected V9 | Deployed V7 replay |
| --- | ---: | ---: |
| Transactions / fraud labels | 743,909 / 699 | 743,909 / 699 |
| Average precision | 0.00094020 | 0.00106606 |
| ROC-AUC | 0.499097 | 0.496829 |
| Alerts | 7,814 | 7,224 |
| True positives | 4 | 6 |
| False positives | 7,810 | 7,218 |
| False negatives | 695 | 693 |
| True negatives | 735,400 | 735,992 |
| Precision | **0.051190%** | **0.083056%** |
| Recall | 0.572246% | 0.858369% |
| Actual alert rate | 1.050397% | 0.971087% |

V9 generated more false alerts and detected fewer fraud labels. Its AP is
essentially the later fraud prevalence, 0.00093963. A small ROC-AUC difference
does not support a useful improvement. No operating-period threshold met
20%, 50% or 80% precision with at least 100 alerts, at least 20% recall and at
most 1% workload. No threshold was cherry-picked from later examples.

| Month | V9 alerts | V9 true positives | V7 true positives |
| --- | ---: | ---: | ---: |
| July | 1,357 | 2 | 3 |
| August | 1,358 | 0 | 0 |
| September | 1,212 | 1 | 1 |
| October | 1,375 | 0 | 1 |
| November | 1,280 | 1 | 1 |
| December | 1,232 | 0 | 0 |

Digital error/count features have the highest fitted feature importance, but
that is not evidence of fraud causation or useful out-of-period ranking.
All 2025 development periods were inspected previously; these results remain
exploratory. The 2026 final test was not read and should not be opened to seek a
more favorable result for a rejected candidate.

## Decision and next prerequisite

**Reject V9. Do not replace V7 or claim improved precision.** Across V8/V9,
five new candidates tested the previously inaccessible signal, class weighting,
recency and longer history. The access block was resolved for the authorized
owner account; the tested new features still do not support a useful detector.
These experiments do not prove that labels were assigned randomly.

Further broad parameter sweeps on the same inspected inputs are not justified
by this evidence. The distinct next prerequisite is label/arrival provenance
or a new verified source of predictive information. The
[dimension timing audit](dimension_timing_audit_report.md) provides exact
questions for the producer and documents substantial date inconsistencies.

All new changes are research code, shared notebooks, job runs, MLflow candidate
artifacts and aggregate documentation. Production retains its existing
experimental score, authenticated customer scope, mandatory human review and
disabled automatic decisions. No customer records or credentials were exported.
