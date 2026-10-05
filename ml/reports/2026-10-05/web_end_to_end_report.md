# Persisted web-to-advisor prediction verification

The complete existing AWS web workflow passed on 2026-10-05 at 07:42 UTC.
Test reference: `ML-E2E-20261005-023840`. The user explicitly authorized creating
and confirming a test complaint and opening it as an advisor.

## Browser procedure

1. Signed in through the deployed login form as the demo customer, using an
   isolated browser session. Selected the existing Mexican demo customer.
2. Submitted a complaint for an existing owned credit-card charge, explicitly
   marking its description as a controlled ML integration test.
3. Read the original assistant's charge summary and sent customer confirmation
   through the chat input. The original human-handoff notice appeared.
4. Signed in as the advisor in a separate browser session, opened Chats /
   Complaints, and selected the exact newly created conversation.
5. Verified that the existing case card rendered the native experimental model
   index, the frozen-threshold result and human-review wording.
6. Reloaded the advisor page, reopened the same conversation and confirmed that
   the prediction and test marker were still present.
7. Read the authenticated advisor API to confirm that persisted handoff facts
   contain `score_status: experimental_prediction`, the expected native model
   run, and the same transaction reference as the bank-verified charge.

## Results

- Real inference was persisted through the original backend and rendered by
  the original advisor interface; this was not a direct-agent-only test.
- Model run: `663c44e0c3de40718830f5362dce5a9b`.
- `review_required` remained true; `automatic_decisions_enabled` remained false.
- Browser page errors: zero across both sessions.
- Final conversation state: `human_queue`. The case was opened for inspection
  but was not claimed, resolved or deleted. It remains identifiable by the
  test reference in its description.
- The application's normal chat and handoff records were created. Existing
  bank source tables, schemas and permissions were not modified.

No credentials, customer identifiers, transaction records or per-customer
scores are committed in this report. A local screenshot of only the rendered
ML notice was saved for the user outside the repository. Aggregate verification
evidence is in [web_end_to_end_data.json](web_end_to_end_data.json).

This verifies integration and persistence only. Model quality remains as
recorded in [the V7 execution report](executable_predictions_report.md); the
index is not a validated fraud probability and does not establish fraud or
innocence.
