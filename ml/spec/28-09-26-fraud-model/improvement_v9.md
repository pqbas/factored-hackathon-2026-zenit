# V9: longer digital-history coverage and Gold-consistent comparison

Status: predeclared before V9 execution on 2026-10-05.

V8 completed successfully but found only four frauds among 7,371 later alerts.
Seven-day digital coverage was approximately 6%. This motivates one distinct
coverage hypothesis: extend latest eligible event history to ninety days, adding
thirty-/ninety-day counts and ninety-day login/error counts. Higher coverage
does not imply predictive signal. Two candidates compare natural and positive
weight 20, with V8's bounded capacity, sampling, inverse-inclusion weighting,
fit-only medians and temporal development periods. No additional recency sweep
or threshold tuning on later labels is planned.

Use `workspace.bank_gold.customer_transactions VERSION AS OF 1` and
`workspace.bank_silver.digital_events VERSION AS OF 4`. Gold backfills missing
non-USD exchange conversions. V8 replayed the native V7 binary over Silver,
yielding slightly different baseline alert counts; that comparison must be
described as a Silver-input sensitivity, not an exact production-input replay.
V9 verifies baseline rows/frauds/confusion counts against the original V7
manifest on Gold. A failed replay check blocks even exploratory promotion.

The same conservative availability proxy and customer-bound history apply.
Exact lower boundaries are included; simultaneous/future events are excluded.
An independent ninety-day Python/Spark fixture precedes fitting. Original
banking tables, schemas, grants and deployments are unchanged by the notebook.
The final 2026 test remains sealed; repeatedly inspected 2025 periods remain
exploratory. Existing label and arrival provenance limitations remain.

An additional read-only audit found no missing customer/product joins among
2,994,597 pre-July transactions, but 744,640 precede customer registration and
741,683 precede product opening. Current dimension snapshots therefore cannot
be treated as consistently available historical features. Product type,
opening channel and age-cohort marginal fraud rates also remain near baseline.
No such snapshot fields are added to V9; no fraud labels are manufactured.

Apply the [V8 usefulness gate](improvement_v8.md), plus exact Gold baseline
confusion-count replay. Save aggregate evidence and native challenger artifacts
in MLflow. A rejected experiment does not replace the deployed V7 model. A
candidate passing the gate still requires independent final evaluation and
verified serving-feature availability before any production change.
