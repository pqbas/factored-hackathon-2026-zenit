# Requirements: El examen contra producción

Pedido explícito del usuario vía w1:p4 (30-09-26): desplegar el agente y el
back actuales a prod, y medir allí la precisión, el p50 y el p95 con el
holdout (20×3).

## 1. Functional requirements

1. `npm run eval` acepta `--allow-prod`, y solo con ese flag corre contra
   `https://*.databricksapps.com`. Sin el flag, sigue rechazando todo lo que
   no sea local.
2. Contra una App desplegada, cada request va con el token OAuth del usuario
   de la CLI (el proxy de la App lo identifica), y ese usuario tiene que ser
   admin del back. Los casos con pasos de asesor se rechazan, porque necesitan
   usuarios asesores locales.
3. Cada corrida guarda su `chatId` en el reporte. `npm run eval:cleanup --
   --report <json> --base <url> --allow-prod` borra esos chats por la API del
   back, como su dueño.
4. Prod tiene los tokens demo de la evaluación:
   - `agent/app.yaml` define `DEMO_SESSIONS_JSON`: los 13 clientes,
     `demo-closed`, `demo-expired` y `demo-tool-down`;
   - `back/app.yaml` define `DEMO_CUSTOMERS_JSON`, con los mismos tokens.
5. El reporte de prod lleva el label `prod` y se compara con el holdout
   "después" local.

## 2. Decisions

- Las conversaciones de prueba se marcan por su `chatId` en el reporte y no
  por usuario ni título: en prod todas van como el usuario de la CLI, y el
  título lo genera el back. Borrarlas por id es exacto.
- `demo-tool-down`, que hace fallar `get_products` a propósito, queda en prod
  como un token demo más, rotulado "Herramienta caída (prueba)". Solo afecta
  a quien elige ese token.
- Fuera de alcance: correr el dev 40×3 en prod, porque #24 necesita asesores
  locales.

## 3. Context

- `back/scripts/eval/` (runner, guard, args, report).
- `agent/src/db/session_repo.py`: `DEMO_SESSIONS_JSON` como JSON.
- `back/server/src/demo-customers.ts`: `DEMO_CUSTOMERS_JSON`.
