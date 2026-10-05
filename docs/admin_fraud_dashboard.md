# Admin fraud intelligence dashboard

The `/fraud` section brings reviewed dataset evidence, persisted complaint
prediction coverage, and honest model evaluation into the existing Zenit admin
interface. The navigation entry and route are admin-only. The backend separately
enforces authentication and the admin role; hiding the navigation is not the
security boundary.

## What the administrator can inspect

| View | Content | Meaning |
| --- | --- | --- |
| Data overview | Transaction and label counts, prevalence, monthly activity, country/channel/type distributions, currencies, field coverage, timing audits | Descriptive evidence from the synthetic dataset, not confirmed customer fraud |
| Operations | Complaint handoff counts, scored/unavailable counts, threshold flags, open/closed events, daily activity, score histogram, complaint categories | Actual persisted handoff events from the selected local-day cohort |
| ML evaluation | V7 precision, recall, AP, ROC AUC, confusion counts, V8/V9 comparisons, monthly performance, digital-history coverage, fixed threshold | Retrospective July–December 2025 validation, not live outcome accuracy |

The overview has interactive country/channel/type and volume/rate controls.
Historical monthly bars respond to pointer hover, focus and keyboard activation.
Charts have textual labels and expandable data tables. Mobile charts and model
tables scroll inside their own panels, preserving readable labels. The design
reuses existing colors, system fonts, navigation and light/dark themes. New
product copy is available in Spanish and Portuguese.

## Sources and freshness

- `workspace.bank_silver.transactions` Delta v1: the already-reviewed September
  28 profiling and feature-validation reports. Whole-dataset counters include
  the already-published 2026 aggregates; the monthly graph only publishes
  training/validation months before January 2026.
- `workspace.bank_gold.customer_transactions` Delta v1: the deployed V7 manifest
  and exact V9 baseline replay. Model validation remains July–December 2025.
- Digital-history V8/V9 evidence and the October 5 timing audits: aggregate
  evidence only. Timing-audit denominators are separately labeled and cover
  events/transactions before July 2025.
- `ai_chatbot."Handoff"`: one bounded, parameterized SELECT against the existing
  application database. No bank tables are scanned by the dashboard endpoint.

Historical evidence is an explicit snapshot, not a real-time warehouse feed.
Opening or refreshing the dashboard does not start Databricks compute, train a
model, rescore historical transactions or export customer records. Operations
refreshes every 60 seconds while selected and supports today/7-day/30-day ranges
in the browser's IANA timezone. The API accepts at most 31 inclusive days.

Events are counted by handoff creation date, not transaction date. Open counts
refer to that received-event cohort, not the entire historical backlog. One
conversation can have multiple complaint handoffs after reopening. Closing a
handoff only closes the attention workflow; it is not a confirmed fraud label.
All persisted experimental model versions are included in operational counts;
the historical model comparison identifies each evaluated version separately.

## Prediction validity and missing data

A scored event must match the existing advisor-card contract: transaction
inference, experimental prediction, uncalibrated output, human review required,
automatic decisions disabled, numeric score in `[0, 1]` and a Boolean threshold
flag. A legitimate zero score remains scored. Missing, malformed, legacy or
unavailable assessments remain unscored. Histogram bins are `[0,10)`, `[10,20)`,
and so forth, with the last bin `[90,100]` on the displayed index scale.

The score is never described as a calibrated probability or confirmed fraud.
No operational precision is invented: confirmed adjudication labels are not
currently captured. No amounts are summed across currencies.

Empty storage results, absent database configuration and query failure are
different states. An absent or failed database does not display measured zero
KPIs. Historical evidence stays accessible through the same response.

## Reproducibility and implementation

`ml/build_fraud_dashboard.py` builds
`back/server/src/data/fraud-dashboard.json` from committed aggregate evidence.
It checks basic reconciliation and extracts timing measures from reviewed audit
tables. Source paths and SHA-256 hashes are included for traceability. Regenerate
the snapshot when reviewed evidence changes:

```bash
python ml/build_fraud_dashboard.py
```

The backend bundles this small JSON into its existing server build. The frontend
receives it through the protected API; it is not imported into the production
browser bundle. The existing App Runner backend image already packages both the
frontend and backend, so no separate dashboard service is needed.

`GET /api/advisor/fraud-dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD&tz=America/Lima`
returns the historical snapshot, operational aggregates, selected window and
refresh timestamp with `Cache-Control: no-store`. No identifiers, case facts,
customer names, raw transaction records or credentials are returned.

## Validation

- Frontend: 141 unit/integration tests passed, including 8 new dashboard checks.
- Backend: 188 unit tests passed, including 8 new aggregation/API checks. The
  real Express route was exercised with signed sessions: anonymous 401,
  customer/advisor 403, admin 200, invalid dates/ranges/timezones 400.
- Browser: `npm run test:fraud-dashboard` in `back/` passed. Its operational
  inputs are explicitly local fixtures; historical evidence is the reviewed
  aggregate snapshot. It covers all three views at widths 375, 414, 768, 1024
  and 1440, filters, retry, unavailable/empty/error states, Spanish/Portuguese,
  role restrictions and JavaScript errors. No production API is contacted.
- PostgreSQL: the actual SQL was run against synthetic values in a local
  `BEGIN READ ONLY` transaction and rolled back. Scores 0, 0.1 and 1, malformed
  values, safety-contract mismatches and Lima day-boundary exclusions behaved
  as expected. No tables were created or updated.
- Frontend production build, backend build and backend TypeScript check passed.
  The standalone frontend TypeScript command still reports existing issues in
  shared Node declarations and unrelated chat components; no new dashboard
  diagnostic was reported.

The browser command uses Chrome at `/usr/bin/google-chrome`; set `CHROME_BIN`
for a different installation. This configuration starts only Vite and uses API
fixtures. It does not run the repository's database migration/test bootstrap.

## Delivery boundary

Implemented on `feat/diego-admin-fraud-dashboard` with local commits. The remote
ML branch is preserved. These changes have not been pushed, merged or deployed.
The model binary, inference code and existing customer/advisor workflows are
unchanged. No source database, schema, grant or cloud resource was modified.

After the normal review/merge and existing backend deployment, administrators
will find the shield icon in the left navigation or open `/fraud`. The deployed
service must retain its existing SELECT permission on `ai_chatbot."Handoff"`.
