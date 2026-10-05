# AWS admin analytics deployment

The fraud and retention dashboards are deployed in the existing Zenit application
and verified against real Databricks results using the deployed backend identity.
Verification completed on October 5, 2026; no API fixtures were used in the live checks.

- [Fraud dashboard](https://wzmpasrvja.us-west-2.awsapprunner.com/fraud).
- [Retention dashboard](https://wzmpasrvja.us-west-2.awsapprunner.com/retention).
- Both require an authenticated admin session.

## Release evidence

| Item | Verified result |
| --- | --- |
| Backend/frontend artifact commit | `928d68f8` |
| App Runner image | `335741630127.dkr.ecr.us-west-2.amazonaws.com/bank-assistant-back:928d68f8` |
| ECR image digest | `sha256:6d00d7b2160c469f1a6ffd9ff55f0b793610b856490fb28f6c18c08892e1e8b6` |
| Deployment operation | `10e7832e00c747e9bf107481221b97f3`, `SUCCEEDED` |
| Deployment start/end, Lima | 2026-10-05 18:45:57 / 18:49:14 |
| Backend service | `RUNNING`; public health and session endpoints respond |
| Frontend bundle | `/assets/index-CJ5zUF-L.js` |
| Agent | Unchanged image `00539622`, `RUNNING` |

The App Runner source configuration fingerprints, excluding image identifiers,
match the predeployment baseline. Existing runtime settings and secret bindings
were preserved. The deployed team's optional demo sign-in choices were retained
and verified. The previous backend image `09628125` remains available; no rollback
or image deletion was performed.

## Databricks access

Owner CLI reads alone were insufficient: the deployed service identity needed
catalog/schema usage. The following additive permissions were applied to the
existing backend service principal `cc0d82f4-6c8d-4311-bbd2-8a603d1d1073`:

- `USE_CATALOG` on `workspace`.
- `USE_SCHEMA` on `workspace.bank_gold` and `workspace.bank_silver`.
- `SELECT` on `workspace.bank_gold.customer_360`,
  `workspace.bank_gold.customer_transactions`, `workspace.bank_gold.customer_cases`,
  `workspace.bank_gold.interaction_history`, and `workspace.bank_silver.transactions`.

Warehouse access already existed. No privileges were removed, no broad schema
SELECT was granted, and no source tables or schemas were created or altered.
Actual service OAuth preflight succeeded with statement
`01f1c116-7083-160a-b6ec-a1aa1b395b5e`.

## Published results and cache behavior

| Report | Live result | Statement |
| --- | --- | --- |
| Retention | 114,516 eligible; high 446, medium 10,916, watch 47,226, no signal 55,928; reference date 2026-06-18 | `01f1c117-77c3-1794-8d0c-90f7561b7845` |
| Fraud overview | 3,738,506 transactions, 3,713 supplied fraud labels; transactions before 2026-01-01 | `01f1c117-7d26-148d-a701-0825288bf5ed` |

Both protected APIs returned HTTP 200 with fresh Databricks metadata and no
refresh failure. Retention background loading took 9.126 seconds; fraud took
10.028 seconds. Those background durations are separate from HTTP response time.
The response sizes were 30,759 and 11,146 bytes, respectively.

Five sequential warm HTTP reads per report retained the same statement ID:
repeated browser/API reads did not repeat the warehouse query within the
10-minute cache lifetime. Observed warm HTTP latency was 725–1,834.5 ms for
retention and 603.86–1,229.28 ms for fraud. These are a small verification sample,
not a production latency SLA. Caches remain per-process and nonpersistent;
restarts show safe loading or labeled historical fallback while refreshing.

Retention is explainable prioritization using observed signals, not a trained
churn probability. Fraud model evaluation remains historical and experimental;
deploying dashboards did not improve, recalibrate or replace the existing model.
Complaint operations read the existing application database separately.

## Validation and boundaries

- 147 frontend tests and 201 backend unit tests passed; backend TypeScript and
  the production Docker image build passed. The previously documented unrelated
  standalone frontend TypeScript diagnostics remain a limitation.
- Real published browser checks passed for both dashboards at widths 375, 414,
  768, 1024 and 1440, with no page horizontal overflow or JavaScript errors.
- All three fraud views, retention country filtering and expanded evidence were
  exercised. Anonymous API access returned 401; customer and advisor access to
  both protected APIs returned 403. Optional demo sign-in choices were preserved.
- Verification created no chats or complaints. No database migrations, source
  data writes, schema changes, model training or agent deployment were performed.
  Databricks read privileges were added as listed above.
- Deployment used local committed code. No Git push or merge was performed in
  this deployment step; remote branches were preserved.

[Sanitized JSON evidence](aws_admin_analytics_data.json) contains deployment
metadata, permission changes, aggregate counts, cache measurements and browser
checks. It contains no passwords, tokens, original customer identifiers or
individual shortlist entries. The earlier
[owner CLI validation](admin_analytics_report.md) records the predeployment stage.
