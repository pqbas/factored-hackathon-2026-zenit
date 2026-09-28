# 13. Estructura del agente

## 13.1 Estructura de carpetas

```
agent/
├── src/
│   ├── graph/
│   │   ├── build.py
│   │   ├── state.py
│   │   ├── edges.py
│   │   └── nodes/
│   │       ├── gate.py
│   │       ├── classify.py
│   │       ├── load_context.py
│   │       ├── respond.py
│   │       ├── handoff.py
│   │       └── cancel.py
│   ├── tools/
│   │   ├── mcp_client.py
│   │   └── bind_customer.py
│   ├── prompts/
│   │   ├── system.md
│   │   └── messages.py
│   ├── db/
│   │   ├── connection.py
│   │   ├── checkpointer.py
│   │   ├── session_repo.py
│   │   ├── conversation_repo.py
│   │   ├── handoff_repo.py
│   │   └── advisor_repo.py
│   ├── llm/
│   │   ├── chat.py
│   │   ├── jev.py
│   │   └── fallback.py
│   ├── schemas/
│   │   ├── classification.py
│   │   ├── routing.py
│   │   └── api.py
│   ├── api/
│   │   ├── handoffs.py
│   │   ├── advisors.py
│   │   └── conversations.py
│   ├── config.py
│   └── main.py
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── evals/
├── configs/
│   └── routing.yaml
├── scripts/
├── docs/
├── .env.example
├── app.yaml
├── databricks.yml
├── pyproject.toml
└── README.md
```
