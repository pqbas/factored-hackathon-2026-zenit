# Admin analytics read-only validation

This report records the **predeployment owner CLI validation**. Subsequent AWS
deployment, service-identity permission additions and live browser/API checks are
documented in the [AWS deployment report](aws_admin_analytics_report.md).

Validation date: 2026-10-05. The authorized `pqbas` owner CLI was used. No source
tables, schemas, grants or cloud resources were modified. No new final-test
fraud labels were queried. Customer-level rows are omitted from committed
evidence; the full shortlist was validated in memory only.

## Verified findings

| Measure | Result |
| --- | --- |
| Customer snapshot size | 150,000 |
| Eligible active customers with products | 114,516 |
| Snapshot reference date | 2026-06-18, consistent across customer rows |
| High / medium / watch / no signal | 446 / 10,916 / 47,226 / 55,928 |
| Missing activity history | 1 eligible customer |
| Bounded shortlist | 135 references, 15 per country/priority |
| Fraud overview cohort | 3,738,506 transactions before 2026-01-01 |
| Fraud labels in that cohort | 3,713 |
| Missing normalized USD amount | 84,002 |

The supplied customer states include Active, Inactive, Closed and Suspended.
They are current states, not dated forward-looking churn labels. CSAT survey
scores observed in the supplied data are 1–4; valid CSAT inputs use the documented
1–5 scale. No unresolved cancellation signal was observed in this query. The
rules support that signal without inventing observed examples.

Retention countries and priority bands reconcile to the eligible total. Fraud
country, channel, type, currency and monthly counts reconcile to the overview
total and positive count. Its lower total compared with the older full-table
4,425,008-row snapshot is intentional: live descriptive queries exclude the
sealed 2026 final-test period. Historical model evaluation remains unchanged.

## Traceability and timing

- Aggregate retention: `01f1c10d-996b-14ce-b643-339d959e705a`.
- Aggregate fraud overview: `01f1c10d-a816-1249-8782-c17b4aacc0de`.
- Full retention loader: `01f1c10f-42ca-1898-9ac2-3d88937c5b61`.
- Full fraud loader: `01f1c10f-522c-1eb3-8540-928c3694ab76`.

[admin_analytics_data.json](admin_analytics_data.json) contains readiness and
aggregate query results. [admin_analytics_runtime.json](admin_analytics_runtime.json)
contains source metadata and counts from the actual runtime loaders, with no
individual references or histories.

Cold cache access returned loading states in approximately 0.44 ms. Once the
queries completed, 100 paired in-process cache reads took approximately 0.41 ms.
These are backend getter timings, not HTTP, browser or AWS latency measurements.
Retention background load took 28.05 seconds including authentication/query
work; fraud took 31.31 seconds including waiting behind retention in the shared
queue. The frontend does not wait on those operations inside its HTTP request.

## Verification

- 146 frontend tests passed, including retention copy/source/failure checks.
- 200 backend tests passed, including cache concurrency, failure backoff,
  age limits, forced refresh cooldown, warehouse serialization/cancellation,
  cohort reconciliation and admin-only retention API checks.
- Both browser dashboard tests passed: local UI fixtures, five viewport widths,
  Spanish/Portuguese, role restrictions, cached filters, stale/loading/missing
  states and no page JavaScript errors. Individual shortlist values in browser
  tests are explicitly synthetic, not downloaded customer records.
- Frontend production build, backend build and backend TypeScript check passed.
  Standalone frontend TypeScript still reports the existing 65-line diagnostic
  output involving shared Node/chat declarations; no new dashboard diagnostic
  was reported.

The owner identity was validated. The deployed App Runner service identity and
production cache behavior have not been verified. Changes are local and have
not been pushed, merged or deployed. No churn model was trained and no fraud
model artifact or inference behavior was changed.
