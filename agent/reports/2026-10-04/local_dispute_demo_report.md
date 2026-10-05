# Local dispute integration validation

Status: **local synthetic demo implemented and verified**, 2026-10-04 (America/Lima). Source commit `349ee76`; branch `feat/diego-ml-fraud-features`. No deployment, push, source-table change, or database migration was performed.

## Delivered behavior

A customer reports an unrecognized charge, receives only their fixture movements, selects one, and explicitly confirms a review request. The adapter commits the handoff before acknowledging success. An advisor sees the charge and customer statement, claims the conversation, and replies in the customer chat. Once handed off, customer messages are stored for the advisor rather than processed by intake.

The workflow uses a shared intake engine and an in-memory adapter. It also exposes Responses-style non-streaming and SSE output with the existing backend handoff envelope. The final SSE `response.output_item.done` carries `custom_outputs`, including `reason`, `summary`, and `facts`. The existing `policy_escalation` reason is used.

**Scope:** a separate loopback-only integration harness, not the production agent or the original React/Express applications running together. The intake is deterministic and uses predefined text; no LLM or predictive model runs. Transactions and identities are fictional fixtures. There is no banking dispute-table write, financial decision, refund, or card block. The customer report does not establish fraud.

## Python validation

Executed from `agent/`:

```bash
python -m pytest tests/integration/test_local_dispute_demo.py tests/unit tests/integration/test_graph.py -q
```

**133 passed in 1.26 seconds**, comprising 21 new local integration tests and 112 existing unit/graph integration tests. One existing LangGraph serialization deprecation warning was emitted. An initial execution under the sandbox could not complete due to restricted local/thread connections; the successful selected suite ran with local connections allowed.

Verified scenarios: customer and advisor happy path; missing/invalid/expired sessions; cross-customer conversation and transaction access; forged/stale confirmation; changed transaction facts; free-text “yes” not authorizing review; lookup failure; no matching data; injection and sensitive-data masking; cancellation; failed commit and safe retry; concurrent duplicate confirmation; mismatched request-ID reuse; advisor authorization/claim; Portuguese intake; Responses/SSE contract; and blank messages while human-handled.

The original full-suite collection stopped because `databricks_langchain` is missing in this environment. `tests/e2e/test_invocations.py` was therefore not part of the successful selected suite. No claim is made that the whole original project test suite passed.

## Browser validation

Chrome headless with Playwright completed a real HTTP/UI workflow against the loopback server: Spanish customer report, transaction selection, explicit review confirmation, advisor claim, advisor reply visible in the customer chat, Portuguese report/confirmation, and distinct per-customer movement lists. See [browser evidence](local_dispute_demo_browser.json) and `tests/browser/local_dispute_demo_smoke.py`.

Responsive widths checked: **375, 414, 768, 1024, and 1440 pixels**, with no horizontal overflow. No JavaScript page errors occurred. Browser requests stayed on `http://127.0.0.1:8010/`; no external assets/services were requested. Screenshots were generated in `/tmp/local-dispute-demo-desktop.png` and `/tmp/local-dispute-demo-mobile.png` using synthetic data.

Python syntax, JavaScript syntax (`node --check`), whitespace checks, and known credential-pattern scans passed. Health check reported `mode: synthetic_local_demo`, `storage: process_memory`, `fraud_model: not_validated`, `remote_calls: false`.

## Limits and next integration step

Memory state disappears on restart and is not durable. Test session headers are public fictional fixtures and not a production identity mechanism. The demo does not measure real fraud precision, learned intent accuracy, LLM safety/quality, real banking permissions, SSO, production latency, or live persistence. A case reaching human review is an intake outcome, not a resolved financial dispute.

The production complaint route still needs the authorized transaction repository, backend-owned durable pending selection/confirmation state, and the agent handoff emitter connected to the existing backend/UI. The current UC list-transactions function omits transaction IDs; do not pretend an arbitrary displayed movement provides a verified transaction ID in production. That source contract must be addressed before connecting real disputes. Reuse the tested intake and metadata contract, but verify the actual deployed revision and permissions first.

No V1–V6 fraud model is promoted. Model status remains unavailable for decision use, with null risk score. V5/V6 measured precision remains documented separately and is not simulated upward.

Instructions: [LOCAL_DISPUTE_DEMO.md](../../LOCAL_DISPUTE_DEMO.md). Local code/dependencies are committed; the server can run independently of Databricks, PostgreSQL, Lakebase, or external LLM APIs.
