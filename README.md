<h1 align="center">Zenit</h1>

<p align="center">AI-assisted customer service for retail banks: an AI agent answers customers and hands off to human advisors with full context.</p>

<p align="center">
  <img src="docs/arquitectura-aws-databricks.drawio.png" alt="Zenit architecture on AWS and Databricks">
</p>

## Features

- AI customer agent (David) in Spanish and Portuguese: answers credit card and
  savings account questions, registers complaints and checks their status.
- Intent and guardrail classification with Jev; keyword rules as fallback.
- Policy outside the model: handoff rules are deterministic code, the LLM only
  reads language and writes the reply.
- Secure by design: the customer's identity comes from the session, never from
  the chat text, and every data read is fixed SQL filtered by that customer.
- Human handoff with context: David collects and verifies the case first, then
  stops replying until an advisor returns the chat.
- Advisor console: an inbox of human cases and a separate view of the chats
  David is handling.
- Turn queue in the back: messages that arrive while the agent is answering wait
  in Lakebase and are processed in order.
- Governed data: a bronze → silver → gold pipeline on Databricks, copied to
  Lakebase as read-only synced tables.

## Development

The platform has three components that run independently:

**Agent** is a LangGraph graph served at `POST /invocations`.

```bash
cd agent && uv run start-server                 # → :8000 (needs agent/.env)
cd agent && uv run --group dev pytest tests -q  # tests
```

**Back** is an Express server: API, demo login, chat history and the turn queue.
It serves the built front.

```bash
cd front && npm install && npm run build
cd back && npm install && npm run build && npm run start   # → :3000
```

**Front** is the React chat UI and advisor console. For hot reload, run
`npm run dev` in `back` (port 3001) and in `front` (port 3000).

`back/.env` needs `DATABRICKS_CONFIG_PROFILE` and
`API_PROXY=http://localhost:8000/invocations`.

## Deployment

The back (with the front built in) and the agent run on AWS App Runner
(us-west-2). Chats and bank data stay in Lakebase, and the LLM runs on
Databricks Model Serving.

### Data (once, or after new files)

Requirements: Databricks CLI.

```bash
python data/generate_dummy_data.py
databricks fs cp -r --overwrite data/dummy_output dbfs:/Volumes/workspace/bank_bronze/landing
cd data && databricks bundle deploy && databricks bundle run bank_data_pipeline
```

The gold and silver tables are copied to Lakebase with the scripts in
`back/scripts/bank-ro/`.

### Back and agent on AWS

Requirements: an AWS session, Docker, `jq`, `openssl`.

```bash
cd back && scripts/aws/deploy.sh    # build, push and roll out the back
cd agent && scripts/aws/deploy.sh   # build, push and roll out the agent
```

First-time setup (ECR, IAM roles, secrets, services):
[back](back/scripts/aws/README.md) and [agent](agent/scripts/aws/README.md).

## Docs

- [Architecture on AWS + Databricks](docs/arquitectura-aws-databricks.md):
  flow, services and decisions.
- [Attention flow](docs/flujo-atencion.md): conversation stages and handoff to
  advisors.
- [Agent and back limits](docs/limites-agente-back.md): who stores what.
- [Bank data in Lakebase](docs/datos-banco-lakebase.md): synced tables and
  access.
- [Agent](agent/README.md): use cases and technical decisions.
- [Data pipeline](data/README.md): data contract and bronze/silver/gold.
- [Fraud model proposal](docs/ml_fraud_model_proposal.md).
- [Admin fraud intelligence dashboard](docs/admin_fraud_dashboard.md): data insights, complaint prediction coverage, and model evaluation at `/fraud`.
- [Admin retention dashboard](docs/admin_retention_dashboard.md): explainable customer follow-up signals at `/retention`, with asynchronous Databricks reads and shared process caches.

## License

Built for the Factored AI & Data Hackathon 2026. Derived from the Databricks
[banking-agent-accelerator](https://github.com/databricks-industry-solutions/banking-agent-accelerator)
and modified by the team. See [LICENSE.md](LICENSE.md) and
[NOTICE.md](NOTICE.md).
