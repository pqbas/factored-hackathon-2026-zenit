# Fraud Model Precision by Review Capacity

Status: validation-only operating-point analysis of the V2 Random Forest. No final-test data was used.

## Why this analysis

A single “model percentage” is misleading. This report measures precision (share of reviewed alerts that are fraud) and recall (share of all fraud found) at several hypothetical review capacities. These capacities are scenarios, not a recommendation or an agreed bank policy.

- Validation population: 743,909 transactions, 699 fraud labels.
- Validation fraud prevalence / random-review precision baseline: 0.0940%.
- Model: `M3_random_forest`, feature set `v2_customer_history`, ROC-AUC 0.5049.
- Scores and operating points were evaluated on validation only. The final test remains sealed.

## Results

| Review capacity | Transactions reviewed | Fraud found | Recall | Precision | Lift vs random-review baseline |
|---:|---:|---:|---:|---:|---:|
| 0.1% | 744 | 2 | 0.29% | 0.269% | 2.86x |
| 0.5% | 3,720 | 4 | 0.57% | 0.108% | 1.14x |
| 1% | 7,440 | 12 | 1.72% | 0.161% | 1.72x |
| 2% | 14,879 | 18 | 2.58% | 0.121% | 1.29x |
| 5% | 37,196 | 38 | 5.44% | 0.102% | 1.09x |
| 10% | 74,391 | 72 | 10.30% | 0.097% | 1.03x |
| 20% | 148,782 | 137 | 19.60% | 0.092% | 0.98x |

## What the numbers mean

- At 0.1% capacity, precision is 0.269%, but that is just 2 fraud cases among 744 alerts. It is too little evidence to expect a stable result in future data.
- At 1% capacity, precision is 0.161%: about 1.6 fraud alerts per 1,000 reviewed, with 12 fraud cases found out of 699.
- At 10% capacity, precision is 0.097%, almost the 0.094% random-review baseline. At 20%, it is slightly below baseline.
- Precision does not rise smoothly as capacity shrinks. Fraud is rare, so a few cases move the percentage substantially; the very small top groups are especially unstable.
- The best/worst allocation within each tied boundary score is included in the JSON. These validation points did not materially change under tie handling; this does not make them statistically reliable.

## Decision

**None of these operating points has a high enough precision to support automatic fraud decisions.** Even the 0.1% point produces about 997 non-fraud alerts per 1,000 alerts, based on only two observed fraud cases. A human-review workflow would need a separately agreed cost/capacity target and substantially stronger validated signals. Do not describe a selected score threshold as a guaranteed percentage.

Next, resolve read access to `workspace.bank_silver.digital_events` and run the prepared coverage audit. If its coverage is inadequate or a V3 candidate also stays near baseline, investigate label generation and whether the supplied fields contain an observable fraud signal. Keep the final test closed until a candidate meets a usefulness criterion defined in advance.

Databricks parent run: `4821d030aefd45e8bb6d59be622d74d8`. This is an offline experiment; no source table was changed and no predictions were written.
