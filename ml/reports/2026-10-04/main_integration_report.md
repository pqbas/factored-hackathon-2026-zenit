# Original application integration validation

Date: 2026-10-04. Branch: `feat/diego-ml-fraud-features`. Latest imported main: `d79df69` (PR #131), merged as `9a5da4d`. Separate dispute demo removed in `a3a3d79`. Read-only adapters committed in `cfb5f5e`; original complaint integration committed in `752c713`.

## Outcome

The team's original React/Express/LangGraph application runs locally on ports 3000/3001/8000. Browser validation sent a real greeting through all three original services and received David's normal menu with no browser page errors. A real complaint request reached the original route and returned HTTP 200 with experimental fraud model availability metadata. It returned the existing safe bank-read failure and no handoff because the data could not be accessed.

The native `get_fraud_assessment` tool is connected to complaint turns. After the original workflow verifies a charge and obtains confirmation, its policy is also attached to the existing complaint handoff. Backend preservation and the advisor notice were verified with synthetic test fixtures, not a persisted live case.

The model result is explicitly `not_validated`: `risk_score` and `fraud_prediction` are null, with automatic decisions disabled. V5/V6 aggregate evidence remains available. No saved model binary or valid predictive serving endpoint exists. No score or improved precision is fabricated.

## Automated validation

| Check | Passed |
|---|---:|
| Agent unit/integration tests | 450 |
| Backend provider/helper unit tests | 179 |
| Frontend unit tests | 130 |
| ML tests | 66 |
| Total | 825 |

Frontend build and server-only backend build passed. The normal backend build was not run because it includes a database migration. The backend's new `test:unit` configuration does not apply database fixtures or start a database-backed server. Tests were run with the necessary local socket permissions; an earlier restricted-sandbox run failed, and the complete permitted rerun passed.

Coverage includes null score behavior, corrupt/missing evidence, forged promotion metadata, malformed metrics, trusted customer identity, read-only SQL/template restrictions, partial/failing reads, existing complaint verification and handoff, backend fact preservation, and Spanish/Portuguese advisor notice behavior. The existing ML training code and V5/V6 JSON evidence have no diff from the preserved pre-integration checkout.

## Confirmed blockers

| Resource | Observed result |
|---|---|
| Existing Lakebase instance | Personal CLI identity's connection rejected at authentication |
| `workspace.bank_gold` | Missing `USE SCHEMA`, SQLSTATE `42501` |
| `workspace.bank_silver.products` | Missing `SELECT`, SQLSTATE `42501` |
| `workspace.bank_silver.complaints` | Missing `SELECT`, SQLSTATE `42501` |
| `workspace.bank_silver.customers` | Missing `SELECT`, SQLSTATE `42501` |

SELECT on specific Gold tables cannot be verified before the schema permission is available. An authorized owner must provide the relevant read access. No grants were executed. The optional warehouse path does not bypass these permissions.

Chat persistence is disabled (`GET /api/config` reports `chatHistory: false`). No live advisor queue, saved handoff, case creation, refund or account block was exercised. Full operational handoff requires separately authorized persistence and real data access. Missing data is not replaced with invented bank records.

## Change boundaries

Only local source, documentation, dependency environments and commits changed. No database/table/schema/function was created or changed, no source data was altered, and no deployment or push occurred. All ML trainers, notebooks and prior results were preserved. Browser screenshots are temporary local evidence, not committed customer records.

See [the machine-readable report](main_integration_data.json), [the run guide](../../../LOCAL_MAIN_INTEGRATION.md), and [the integration contract](../../spec/28-09-26-fraud-model/dispute_integration.md).
