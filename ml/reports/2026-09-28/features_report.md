# Phase 1 feature validation – 2026-09-28

## Metadata

- **Table**: `workspace.bank_silver.transactions`
- **Delta version**: 1
- **Warehouse**: `07ca55766c9c5097`
- **Profile**: `personal`
- **Start UTC**: `2026-09-28T22:29:20.146436+00:00`

## Normalized USD amount decision

Derivation: `CASE WHEN currency = 'USD' THEN amount ELSE amount_usd END`.
USD-native rows use their own `amount`; non-USD rows use the supplied `amount_usd`.

### Coverage by currency

| Currency | Rows | Null amount | Null amount_usd |
|---|---|---|---|
| USD | 2437979 | 0 | 2437979 |
| COP | 1194444 | 0 | 59436 |
| ARS | 792585 | 0 | 40041 |

- Non-USD rows: **1987029**; missing `amount_usd` conversion: **99477** (5.01%).

- Rows where `amount_usd_norm` would be NULL: **99477** of 4425008 (2.25%).

- USD rows: **2437979**; null `amount`: 0; non-null `amount_usd` on USD rows: 0.

### Conversion ratio (amount_usd / amount) for non-USD rows

| Currency | n | min | avg | max | non-positive | zero amount |
|---|---|---|---|---|---|---|
| COP | 1135008 | 0.000249762044445959 | 0.0002500000103579408094 | 0.000250246133522763 | 0 | 0 |
| ARS | 752544 | 0.002854386562251731 | 0.0028571428445223740183 | 0.002859925925086930 | 0 | 0 |

### Sign consistency

- Negative `amount`: 0; negative `amount_usd`: 0; zero `amount`: 0.

## Conclusion

Normalized USD amount (`amount_usd_norm`) is **retained** as a V1 feature,
alongside raw `amount` and `currency` (which are never missing).

- USD rows correctly use their own `amount` (`amount_usd` is null for all of them).
- Non-USD rows rely on `amount_usd`; a small fraction (5.01% of non-USD,
  2.25% of all rows) lack a conversion, so `amount_usd_norm` is null there.
- Conversion ratios are internally consistent per currency (COP ~0.00025,
  ARS ~0.002857) with no non-positive ratios and no zero/negative amounts.
- Missing `amount_usd_norm` is not imputed in Phase 1; missing handling is
  fitted on the training split only in Phase 2.
