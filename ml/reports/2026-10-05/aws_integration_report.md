# ML integration in the existing AWS assistant

The existing `bank-assistant-agent` and `bank-assistant-back` App Runner services
were updated in `us-west-2` on 2026-10-05. Both run image tag `0ebfff68`, built from
the local ML branch after merging `origin/main` commit `20e0e98`. No separate
chatbot or new service was created.

| Component | Existing URL | Previous image tag | Current image tag |
| --- | --- | --- | --- |
| Web and backend | https://wzmpasrvja.us-west-2.awsapprunner.com | `d79df692` | `0ebfff68` |
| Agent | https://qidmxa8upf.us-west-2.awsapprunner.com | `2e133a9c` | `0ebfff68` |

## Result

The original complaint workflow exposes `get_fraud_assessment`. The agent image
now contains compact, aggregate V5/V6 evaluation evidence in
`agent/configs/fraud-evidence`, with hashes tracing each file to its original
report. Run `python ml/package_fraud_evidence.py --check` to verify reproducibility.

A direct authenticated request to the deployed agent returned HTTP 200,
`use_case: COMPLAINT`, both experiment candidates, and the following policy:
`score_status: not_validated`, `risk_score: null`, `fraud_prediction: null`,
`review_required: true`, and `automatic_decisions_enabled: false`.

The existing advisor case card displays the review notice when an original,
verified and confirmed complaint handoff includes `facts.fraud_assessment`.
This deployment does not provide predictive transaction inference, promote a
model, or improve the previously measured precision.

## Validation

- Agent unit and integration tests: **452 passed**.
- Aggregate packaging reproducibility check: passed.
- Agent and web/backend production container builds: passed.
- Agent tool inside a container without network access or the repository's
  `ml/` directory: both experiment records loaded correctly.
- Deployed agent health: HTTP 200; invocation without its shared token: HTTP 401.
- Authenticated deployed complaint request: expected policy returned; no handoff
  created and no backend chat persistence used.
- Published web, `/ping`, `/api/session`, and its JavaScript bundle: HTTP 200.
  Existing password authentication remained active. The served bundle contains
  both the fraud handoff parser and the ML review notice.

A complete customer-to-advisor workflow that persists a case was not performed
against production. That behavior was covered by the earlier application tests
and remains subject to the original ownership, charge verification and customer
confirmation checks.

## Configuration and scope

Only container image references were updated. The backend configuration hash,
excluding the image reference, matches its pre-update baseline. The agent's
comparison baseline was collected while its update was already in progress;
its resulting configuration hash matches that observation. The agent deployment
script preserved its existing source configuration while replacing the image.

The existing backend-to-agent URL, runtime secret references, Jev classifier,
Databricks service principals and Lakebase bank-read path remain in place.
The local `BANK_READ_SOURCE=databricks` override was not enabled in production.

Databricks profile `pqbas` was authenticated and verified as
`pcubasm1@gmail.com`. Earlier local data-access errors belonged to the personal
CLI identity; they do not establish the production service principal's access.

No setup script, database migration, permission grant, database fixture or
confirmed customer case was executed by this task. Training code, notebooks,
original experiment reports and sealed final-test policy were retained. No
credentials or customer-level records were added to Git. Commits remain local;
container images were published to ECR with the user's deployment authorization.

Previous images remain identified above for an authorized image-only rollback.
Detailed service metadata, operation IDs, image digests and checks are in
[the aggregate deployment evidence](aws_integration_data.json).
