# Demo runbook — customer complaint to advisor, with experimental fraud index

This runbook demonstrates the deployed customer-to-advisor flow in the existing
AWS application and explains how to interpret the experimental model index
honestly. It does not enable automatic decisions.

## What you are demonstrating

A customer reports an unrecognized charge. The original assistant verifies the
charge against existing bank data, the deployed V7 CatBoost model computes a real
experimental score over the owned transaction and strictly earlier customer
history, and the structured case is handed to a human advisor who sees the
experimental index and threshold result.

## Prerequisites

- Access to the deployed application:
  - Web/backend: `https://dmm3yembnz.us-west-2.awsapprunner.com`
  - Agent: `https://5uiztf2nck.us-west-2.awsapprunner.com`
- Two isolated browser sessions: one customer, one advisor.
- A demo customer with an active credit-card or savings product and an owned charge.

## Steps

1. **Customer login.** Sign in through the deployed login form as the demo
   customer. Select the existing Mexican demo customer.
2. **Submit a complaint.** Open a complaint for an existing owned charge and
   clearly describe it (mark it as a controlled test so it is recognizable).
3. **Confirm.** The assistant summarizes the bank-verified charge. Confirm through
   the chat input. The human-handoff notice appears.
4. **Advisor login.** In a separate session, sign in as the advisor and open
   Chats / Complaints.
5. **Open the case.** Select the conversation created in step 2–3.
6. **Show the card.** Point out the experimental index (out of 100), the
   frozen-threshold result, and the human-review wording.
7. **Reload persistence.** Reload the advisor page and reopen the case to show
   the index persists.

## Interpreting the result honestly

- The index is an **uncalibrated model output**, not a validated fraud probability
  and not model precision. A value such as `3.40 / 100` is not a 3.40% fraud chance.
- A positive flag does **not** confirm fraud; a negative flag does **not**
  establish innocence.
- `review_required` is always true and `automatic_decisions_enabled` is always
  false. Human review is mandatory regardless of the index.
- Engineering integration success is separate from predictive quality. V7
  validation precision is 0.083056%, recall 0.858369%, ROC-AUC 0.496829.

## What not to claim

- No measured reduction in cost or handling time.
- No automatic fraud decision is enabled.
- The index is not a validated fraud probability.
- Data freshness follows the existing manually refreshed Lakebase mirror; this is
  synchronous inference over stored transactions, not live payment interception.

## Reference

- End-to-end verification: `ml/reports/2026-10-05/web_end_to_end_report.md`
  (test reference `ML-E2E-20261005-023840`).
- Model execution: `ml/reports/2026-10-05/executable_predictions_report.md`.
- Deployment: `ml/reports/2026-10-05/aws_predictions_report.md`.
