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
│   │   └── session_repo.py
│   ├── llm/
│   │   ├── chat.py
│   │   ├── jev.py
│   │   └── fallback.py
│   ├── schemas/
│   │   ├── classification.py
│   │   └── routing.py
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

El agente no guarda estado entre requests: no hay checkpointer y el historial
llega del back en cada llamada (ver
[Límites entre el agente y el back](../../docs/limites-agente-back.md)).
