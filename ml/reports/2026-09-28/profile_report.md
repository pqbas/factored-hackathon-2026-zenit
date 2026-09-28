# Phase 0 profiling – 2026-09-28

## Metadata

- **Table**: `workspace.bank_silver.transactions`
- **Delta version**: 1
- **Warehouse**: `07ca55766c9c5097`
- **Profile**: `personal`
- **Start UTC**: `2026-09-28T22:11:39.042644+00:00`

## Row counts

| Metric | Value |
|---|---|
| Dictionary estimate | 5,000,000 |
| Previous team count | 4,425,008 |
| **Measured rows** (v1) | **4425008** |
| Distinct transaction_ids | 4425008 |
| Null transaction_ids | 0 |
| Duplicate ids (extra rows) | 0 |
| Null is_fraud labels | 0 |
| Fraud positives | 4316 |
| Fraud negatives | 4420692 |
| **Fraud prevalence** | **0.0975%** |

## Date range

- **Min**: 2023-06-17T06:01:30.000Z
- **Max**: 2026-06-18T05:59:41.000Z

## Monthly distribution

| Month | Total | Fraud | Prevalence |
|---|---|---|---|
| 2023-06-01 | 56260 | 54 | 0.0960% |
| 2023-07-01 | 121313 | 138 | 0.1138% |
| 2023-08-01 | 127592 | 137 | 0.1074% |
| 2023-09-01 | 119559 | 97 | 0.0811% |
| 2023-10-01 | 127793 | 140 | 0.1096% |
| 2023-11-01 | 121984 | 125 | 0.1025% |
| 2023-12-01 | 125969 | 123 | 0.0976% |
| 2024-01-01 | 122201 | 121 | 0.0990% |
| 2024-02-01 | 117135 | 118 | 0.1007% |
| 2024-03-01 | 121588 | 135 | 0.1110% |
| 2024-04-01 | 121330 | 125 | 0.1030% |
| 2024-05-01 | 126371 | 132 | 0.1045% |
| 2024-06-01 | 121816 | 110 | 0.0903% |
| 2024-07-01 | 128772 | 115 | 0.0893% |
| 2024-08-01 | 122764 | 129 | 0.1051% |
| 2024-09-01 | 117525 | 131 | 0.1115% |
| 2024-10-01 | 127493 | 137 | 0.1075% |
| 2024-11-01 | 121481 | 122 | 0.1004% |
| 2024-12-01 | 122761 | 107 | 0.0872% |
| 2025-01-01 | 122180 | 122 | 0.0999% |
| 2025-02-01 | 110465 | 110 | 0.0996% |
| 2025-03-01 | 123716 | 112 | 0.0905% |
| 2025-04-01 | 120744 | 103 | 0.0853% |
| 2025-05-01 | 126997 | 131 | 0.1032% |
| 2025-06-01 | 118788 | 140 | 0.1179% |
| 2025-07-01 | 126882 | 130 | 0.1025% |
| 2025-08-01 | 126039 | 119 | 0.0944% |
| 2025-09-01 | 118563 | 107 | 0.0902% |
| 2025-10-01 | 129268 | 125 | 0.0967% |
| 2025-11-01 | 120775 | 103 | 0.0853% |
| 2025-12-01 | 122382 | 115 | 0.0940% |
| 2026-01-01 | 121962 | 109 | 0.0894% |
| 2026-02-01 | 115098 | 87 | 0.0756% |
| 2026-03-01 | 123915 | 111 | 0.0896% |
| 2026-04-01 | 126492 | 117 | 0.0925% |
| 2026-05-01 | 127559 | 109 | 0.0855% |
| 2026-06-01 | 71476 | 70 | 0.0979% |

## Temporal partition viability

| Partition | Total | Fraud | Prevalence |
|---|---|---|---|
| train (< 2025-07-01) | 2994597 | 3014 | 0.1006% |
| validation (2025-07-01 – 2025-12-31) | 743909 | 699 | 0.0940% |
| test (≥ 2026-01-01) | 686502 | 603 | 0.0878% |

## Country distribution

| Country | Total | Fraud | Prevalence |
|---|---|---|---|
| México | 2146309 | 2132 | 0.0993% |
| Colombia | 1289503 | 1198 | 0.0929% |
| Argentina | 867561 | 864 | 0.0996% |
| USA | 40621 | 38 | 0.0935% |
| Spain | 40542 | 39 | 0.0962% |
| Brazil | 40472 | 45 | 0.1112% |

## Channel

| Channel | Total | Fraud | Prevalence |
|---|---|---|---|
| POS | 1548161 | 1467 | 0.0948% |
| ATM | 1328334 | 1331 | 0.1002% |
| Web | 663445 | 656 | 0.0989% |
| App | 663414 | 634 | 0.0956% |
| Branch | 132495 | 143 | 0.1079% |
| Transfer | 89159 | 85 | 0.0953% |

## Transaction type

| Type | Total | Fraud | Prevalence |
|---|---|---|---|
| Purchase | 1083406 | 1086 | 0.1002% |
| Withdrawal | 964673 | 951 | 0.0986% |
| Transfer | 896438 | 798 | 0.0890% |
| Payment | 738964 | 730 | 0.0988% |
| Deposit | 609409 | 607 | 0.0996% |
| Adjustment | 132118 | 144 | 0.1090% |

## Missing values (V1 candidate features)

| Column | Missing | Pct |
|---|---|---|
| `amount` | 0 | 0.00% |
| `currency` | 0 | 0.00% |
| `amount_usd` | 2537456 | 57.34% |
| `transaction_type` | 0 | 0.00% |
| `channel` | 0 | 0.00% |
| `merchant_category` | 3396215 | 76.75% |
| `transaction_country` | 0 | 0.00% |
| `transaction_date` | 0 | 0.00% |

## Amount distribution

| Stat | Value |
|---|---|
| total | 4425008 |
| zero_amount | 0 |
| negative_amount | 0 |
| min | 5.00 |
| max | 39999828.48 |
| p01 | 30.68 |
| p10 | 180.59 |
| p50 | 5398.22 |
| p90 | 4315225.61 |
| p99 | 3.272936896E7 |

## Currency distribution

| Currency | Total | Has amount_usd |
|---|---|---|
| USD | 2437979 | 0 |
| COP | 1194444 | 1135008 |
| ARS | 792585 | 752544 |

## fraud_score leakage diagnosis

| Metric | Value |
|---|---|
| Scored rows | 3539851 |
| Null fraud_score | 885157 |
| fraud_score >= 70 (total) | 999 |
| ≥70 AND is_fraud = TRUE | 999 |
| ≥70 AND is_fraud = FALSE | 0 |
| Mean (non-null) | 15.031166 |
| Min (non-null) | 0.00 |
| Max (non-null) | 99.99 |

| Score bucket | is_fraud | Count |
|---|---|---|
| null | false | 884266 |
| null | true | 891 |
| <30 | false | 3535817 |
| <30 | true | 1052 |
| 30-49 | false | 609 |
| 30-49 | true | 703 |
| 50-69 | true | 671 |
| >=70 | true | 999 |

## Cardinality

| Attribute | Distinct values |
|---|---|
| transaction_type | 6 |
| channel | 6 |
| merchant_category | 6 |
| transaction_country | 6 |
| currency | 3 |

## Statement execution timings

| Label | Statement ID | State | Rows | Duration (ms) |
|---|---|---|---|---|
| row_counts | 01f1bb89-943b-13cb-96f2-6f94a13abac2 | SUCCEEDED | 1 | 3090.8228979969863 |
| key_duplicates | 01f1bb89-9643-1b6f-8a3e-046cc032e0e3 | SUCCEEDED | 1 | 2460.138990001724 |
| label_distribution | 01f1bb89-97a1-177c-8971-3b5f7799ea36 | SUCCEEDED | 1 | 2306.8616810014646 |
| date_range | 01f1bb89-98e9-1af4-8c6f-bcb21843bfa4 | SUCCEEDED | 1 | 2217.3557819987764 |
| monthly_totals | 01f1bb89-9a3e-1b55-a602-f2477c55e114 | SUCCEEDED | 37 | 1932.6874180005689 |
| country_profile | 01f1bb89-9b69-1f59-b1d5-990e3c671151 | SUCCEEDED | 6 | 1939.9334209992958 |
| channel_profile | 01f1bb89-9ca0-1804-b07a-6d2ecefac954 | SUCCEEDED | 6 | 2047.6451499998802 |
| type_profile | 01f1bb89-9dca-1d1c-8df1-d79b61db8c1e | SUCCEEDED | 6 | 2049.724693999451 |
| partition_check | 01f1bb89-9efe-18bd-92b3-6c288b05947c | SUCCEEDED | 3 | 1748.7490060011623 |
| missing_v1_features | 01f1bb89-a017-1c01-9a9a-52aca72d340b | SUCCEEDED | 1 | 2038.167615999555 |
| amount_stats | 01f1bb89-a155-10ee-993a-d1fbeaa2fb5b | SUCCEEDED | 1 | 4609.102672999143 |
| currency_distribution | 01f1bb89-a3fe-15c5-9320-1f2015508446 | SUCCEEDED | 3 | 1947.086093998223 |
| fraud_score_leakage | 01f1bb89-a523-1f7a-9bf8-e3cca9f09d8e | SUCCEEDED | 1 | 1842.0312390007894 |
| fraud_score_vs_label | 01f1bb89-a643-10d8-bfcb-f9a4d5fb5a48 | SUCCEEDED | 8 | 1844.583275000332 |
| distinct_categories | 01f1bb89-a76d-1a99-8082-e4cd42e5e032 | SUCCEEDED | 1 | 2354.098645002523 |

## Remaining uncertainties

- Training compute compatibility has not been verified.
- Label origin/maturation and learnable signal are not determined by counts alone.
- Timezone of `transaction_date` is not confirmed.
- `amount_usd` conversion methodology audit is not complete.
