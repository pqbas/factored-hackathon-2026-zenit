# Zenit against the evaluation criteria

Where to find the evidence for each judging dimension. Every number comes from
a dated report in this repo; the link next to it is the source.

Slides (6 + team and links): Zenit deck in Canva. 1 cover, 2 approach,
3 architecture, 4 demo, 5 results, 6 key technical decisions.

## Quality over quantity

We built one focused product: a customer-service agent for a retail bank that
answers what it can answer with the customer's own data and hands off the rest
to a human advisor with the case already collected.

- Chosen flows, from the bank's own data: balance and transaction queries (35%
  of 480,678 inbound calls), charge complaints (17%, only 43.7% solved on the
  first call) and cancellations (3%). See [evaluacion.md](evaluacion.md#el-problema-en-datos).
- Out of scope on purpose: voice, automatic fraud decisions, edge-case
  business rules. See [camino-a-produccion.md](camino-a-produccion.md).

## Technical judgment

Architecture, trade-offs, reliability, safety and production readiness.

| Decision | Why | Trade-off | Source |
| --- | --- | --- | --- |
| Handoff policy is code; the LLM only reads language and writes the reply | Auditable, testable behavior | Less flexible | [05-dispatch](../agent/docs/05-dispatch.md), [06-politica-de-derivacion](../agent/docs/06-politica-de-derivacion.md) |
| Guards check the LLM output instead of replacing it | A reply with account data but no tool call is discarded and retried with the tool (9 of 279 turns) | One extra LLM call when it fires | [evaluacion.md §6](evaluacion.md#6-guard-de-grounding) |
| Customer identity comes from the session, never from the chat | The LLM can't read another customer's data; unknown sessions fail closed | No free-form queries | [01-identidad-de-usuario](../agent/docs/01-identidad-de-usuario.md), [12-customer-id-en-herramientas](../agent/docs/12-customer-id-en-herramientas.md) |
| At runtime everything is read from Lakebase | Serverless reads through MCP cost USD 110 in testing; Lakebase is a fixed cost already paid for chats, and a query takes 4 ms from AWS | Data is a snapshot | [camino-a-produccion.md](camino-a-produccion.md), [14-herramientas-sobre-lakebase](../agent/docs/14-herramientas-sobre-lakebase.md) |
| Least privilege between services | Back and agent have separate service principals; the agent can only SELECT 4 tables; shared token between back and agent; secrets only in Secrets Manager | More credentials to rotate | [16-agente-en-aws](../agent/docs/16-agente-en-aws.md) |
| AWS App Runner, not Bedrock AgentCore | Same HTTP contract, no back changes, 0.5–1 day instead of 2–3 | USD 0.34/day idle | [17-agentcore-vs-app-runner](../agent/docs/17-agentcore-vs-app-runner.md) |
| The agent is stateless; the back owns history and handoff | One owner for each piece of state | The back must send the history every turn | [limites-agente-back.md](limites-agente-back.md) |

Safety results on the held-out exam: 0 unsafe outcomes in 60 runs (sensitive
data, other customers' data, manipulation, expired session, tool down). See
[04-guardrails](../agent/docs/04-guardrails.md) and [evaluacion.md](evaluacion.md).

## AI engineering

Backend, frontend, system integration and deployment.

- Agent: LangGraph graph behind `POST /invocations`, tools with fixed SQL over
  Lakebase. See [agent/README.md](../agent/README.md) and
  [13-estructura-del-agente](../agent/docs/13-estructura-del-agente.md).
- Back: Express API, demo login, chat history and a turn queue in Lakebase.
  See [back/README.md](../back/README.md).
- Front: React chat for customers and an advisor console with the handoff
  inbox. See [flujo-atencion.md](flujo-atencion.md).
- Deployment: back and agent on AWS App Runner (us-west-2), images in ECR,
  secrets in Secrets Manager, LLM on Databricks Model Serving. See
  [arquitectura-aws-databricks.md](arquitectura-aws-databricks.md) and
  [demo-runbook.md](demo-runbook.md).
- Tests: 841 automated tests (agent 462, front 133, back 180, ML 66) at the
  time of the 5 October report.

## Data engineering

Data quality, pipelines, preparation and reproducibility.

- Medallion pipeline in Unity Catalog: 13 tables, 4.43M transactions, bronze
  → silver → gold, with the data contract in code (`data/pipeline/tables.py`).
- Blocking quality checks in silver: a failing table keeps its last good
  version and the job stops before gold. Every check is logged in
  `bank_silver._dq_report`.
- 9 issues found in the real dataset and fixed (BOM, "México"/"Mexico", no
  MXN, product types in Spanish…). Late-update test: 10/10 PASS.
- Gold and silver are copied to Lakebase as read-only synced tables for the
  agent and the back.
- Rebuild from scratch: [data/README.md §8](../data/README.md). Validation:
  [data_pipeline_validation.md](data_pipeline_validation.md) and
  [datos-banco-lakebase.md](datos-banco-lakebase.md).

## Machine learning

Modeling approach, evaluation, baselines and performance.

Intent classifier (learned component against a baseline), 39 labeled messages:

| Classifier | Accuracy | p50 |
| --- | --- | --- |
| Keyword rules (baseline) | 66.7% | ~0 s |
| Llama 3.1 8B | 87.2% | 2.5 s |
| Jev (used on AWS) | 92.3% | 0.28 s |
| Qwen 3 Next 80B | 94.9% | 2.7 s |

Source: [evaluacion.md §5](evaluacion.md#5-clasificador-de-intención-componente-aprendido-vs-baseline).

Fraud model:

- 4,316 frauds in 4.43M transactions (0.0975%), temporal split, final test
  never opened.
- V1–V7: logistic regression, random forest, XGBoost and CatBoost. ROC-AUC
  stayed near 0.50 on the later period, so no model was promoted.
- `fraud_score` was excluded as likely leakage: every row with a score of 70
  or more is fraud, and its origin is unknown.
- The CatBoost score reaches the advisor as experimental; a human decides.
- Source: [ml/README.md](../ml/README.md) and
  [executable_predictions_report.md](../ml/reports/2026-10-05/executable_predictions_report.md).

## Data analytics

Metrics, insights, visualization and decision support.

- Baseline of the current service, from 686,296 call-center contacts: 85% by
  phone, with resolution, follow-up, duration and advisor hours per reason.
  This is how the flows were chosen. See [evaluacion.md](evaluacion.md#el-problema-en-datos).
- Agent results on the held-out exam, 20 cases × 3 runs against the deployed
  system:

| Metric | Before (local) | After (deployed) |
| --- | --- | --- |
| Conversations that follow the policy | 83.3% | 95.0% |
| Correct handoffs | 15/18 | 18/18 |
| Unsafe outcomes observed | 0 | 0 |
| Latency per turn p50 / p95 | 10.7 s / 18.6 s | 2.0 s / 3.7 s |
| Cost per case solved alone | USD 0.0133 | USD 0.0099 |
| Same verdict in all 3 runs | 19/20 | 20/20 |

- Decision support for the advisor: the handoff arrives with the verified
  charge, the reason and, for complaints, the experimental fraud score.
- Full method and limitations: [evaluacion.md](evaluacion.md) and
  [comparacion.md](../back/scripts/eval/results/comparacion.md).
