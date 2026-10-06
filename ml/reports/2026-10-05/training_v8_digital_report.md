# V8 digital-history challenger: completed, rejected

The newly accessible digital-event source was used in a real training run.
Three CatBoost candidates completed successfully. The selected candidate did
not improve useful precision, and no production artifact was replaced.

- Shared notebook: `/Shared/fraud-eda/12_digital_history_challenger`.
- Databricks run: [1045349607856484](https://dbc-184e79fe-04dc.cloud.databricks.com/?o=7474647867986650#job/179040788897459/run/1045349607856484).
- Task: `427959278571538`; MLflow run: `4bad27824082499e8675958c1e0bf56f`.
- Source code commit: `8207cfb`; exact source hashes are in the
  [aggregate evidence](training_v8_digital_data.json).
- Python/Spark independent timing fixture passed; task result SUCCESS.
- Trainer runtime: 542.03 seconds; full job runtime: 592.55 seconds.
- Source snapshots: Silver transactions v1 and digital events v4.
- Final-test data and source tables were not modified or exported.

## Coverage and candidate selection

Conservative digital history uses the same customer and
`max(event_date, midnight after process_date)` in the seven days before T.
This proxy is not proof of arrival availability. No IP addresses, session IDs,
customer IDs or outcome fields enter the predictor matrix.

| Period | Transactions | With digital history | Fraud labels in covered rows |
| --- | ---: | ---: | ---: |
| Fit | 2,271,707 | 136,328 | 141 |
| Selection | 356,361 | 21,210 | 20 |
| Operating threshold | 366,529 | 21,935 | 16 |
| Later validation | 743,909 | 44,840 | 39 |

Only approximately 6% of transactions have eligible seven-day history. Coverage
does not establish that the remaining customers had no digital activity.

| Candidate | Retained trees | Selection average precision | Selection ROC-AUC |
| --- | ---: | ---: | ---: |
| D0 natural class weight | 131 | 0.00113565 | 0.539198 |
| D1 positive class weight 20 | 14 | 0.00108482 | 0.526662 |
| D2 recent-fit natural weight | 3 | 0.00101802 | 0.508195 |

D0 was selected on January–March. Its threshold, `0.0014291930349341238`, was
frozen on April–June for an approximately 1% review budget. July–December was
evaluated at natural prevalence without later threshold optimization.

## Later results and source-comparison caveat

| Measure | Selected V8 | Native V7 replay on Silver inputs |
| --- | ---: | ---: |
| Average precision | 0.00099274 | 0.00106499 |
| ROC-AUC | 0.515838 | 0.496244 |
| Alerts | 7,371 | 7,228 |
| True positives | 4 | 6 |
| False positives | 7,367 | 7,222 |
| Precision | 0.054267% | 0.083011% |
| Recall | 0.572246% | 0.858369% |

This V7 comparator loads the exact deployed binary, medians and threshold, but
uses the experiment's Silver transaction inputs. Gold additionally backfills
missing non-USD conversions from exchange rates. Consequently this is a
Silver-input sensitivity comparator, not an exact reproduction of the original
Gold validation. Original V7 Gold results remain 6 / 7,224 alerts, precision
0.083056%. V9 uses Gold to remove this input mismatch and checks replay counts.

V8 fails the predeclared usefulness gate. A slightly higher ROC-AUC does not
offset worse precision and average precision. Zero positives were found in
July and November; only one in each other month. No high-precision operating
claim or calibrated probability is supported. All development periods had
been inspected previously; this is exploratory evidence.

## Follow-up

The [V9 specification](../../spec/28-09-26-fraud-model/improvement_v9.md) tests
ninety-day digital history and thirty-/ninety-day event counts to address sparse
coverage. It predeclares two candidates and a Gold-consistent V7 comparator.
No automatic decisions, source/schema/grant changes, model registry entries,
serving endpoint changes, or AWS deployments were performed by V8.
