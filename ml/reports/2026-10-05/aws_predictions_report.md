# Real transaction predictions in the existing AWS application

The original AWS agent and web/backend now run image tag `00539622`. Both
App Runner update operations succeeded. No separate chatbot or service was
created. Source configuration fingerprints, excluding the image reference,
match the baseline captured before these updates.

Web: https://wzmpasrvja.us-west-2.awsapprunner.com
Agent: https://qidmxa8upf.us-west-2.awsapprunner.com

## Verified behavior

A direct authenticated request to the deployed original agent used a real,
owned charge read from existing Lakebase. The original complaint verification
and confirmation workflow produced an experimental native CatBoost score and
the frozen-threshold classification. Top-level `fraud_assessment` matched
`handoff.facts.fraud_assessment`, with `score_status: experimental_prediction`,
`review_required: true` and `automatic_decisions_enabled: false`. The native
model run is `663c44e0c3de40718830f5362dce5a9b`.

The verification called the agent directly; it did not save a chat or case
through the backend. No customer identifiers, transaction rows or per-customer
scores are committed in this report. A separate read-only feature lookup
rejected a cross-customer transaction request.

The published original frontend bundle contains the experimental index,
frozen-threshold notice and human-review wording. Its advisor case card
consumes the existing handoff JSON facts; no database migration is required.
A persisted end-to-end advisor case was not created for verification. Backend
fact preservation and card rendering are covered by tests.

## Validation

- Agent unit and integration tests: 462 passed.
- Frontend tests: 133 passed, including rendered prediction and unavailable cards.
- Backend unit tests: 180 passed; no fixture database or migration setup.
- ML tests: 66 passed.
- Production images built successfully, including the safe backend server build.
- Offline agent container: native artifact loading, nonconstant scores, tool
  construction and application import passed.
- Deployed health, web, session and frontend bundle checks passed.
- Invocation without the existing shared token remains HTTP 401.

## Interpretation and limits

This deployment adds executable inference, not an improvement in predictive
quality. V7 validation precision is 0.083056% (6/7,224), recall 0.858369% and
ROC-AUC 0.496829. The experimental index is an uncalibrated model output, not
a validated fraud probability. A positive flag does not confirm fraud and a
negative flag does not establish innocence. No automated refund, account block
or approval decision is enabled. See [the model execution report](executable_predictions_report.md).

Inference is synchronous over the existing stored transaction and strictly
earlier event-time history. Input freshness follows the existing manually
refreshed Lakebase mirror; this does not establish real-time payment capture.

Git commits remain local on `feat/diego-ml-fraud-features`; no Git push or PR
was performed. Authorized container images were published to ECR and deployed
to the existing services. No source table, schema, grant or fixture was changed.
