# Plan: Filtro por motivo de derivación, cliente demo Eduardo y cliente guardado del chat

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/packages/db/src/queries.ts` | existente | Modificado: `handoffReason` en `getChats` y `getCustomerInbox`; `byHandoffReason` y `withAdvisor` en `getConversationCounts` |
| `back/server/src/routes/advisor.ts` | existente | Modificado: lee `?handoffReason=` y lo pasa a las queries |
| `back/server/src/demo-customers.ts` | existente | Modificado: suma `demo-mx-2` y `tokenForCustomerId` |
| `back/server/src/routes/chat.ts` | existente | Modificado: `demoCustomerToken` en `GET /:id` |
| `back/scripts/scenarios/06-estado-reclamo.json` | existente | Modificado: Eduardo y flujo 3.D2 |
| `back/tests/routes/reason-filter.test.ts` | — | Nuevo |
| `back/tests/ai-sdk-provider/demo-customers.test.ts` | existente | Modificado: `demo-mx-2` y `tokenForCustomerId` |
| `back/scripts/seed-console.ts` | — | Nuevo: siembra de todos los casos de la consola en local |
| `back/scripts/simulate-customers.ts` | existente | Modificado: exporta sus helpers |

---

## Group 1: Queries

1. En `back/packages/db/src/queries.ts`, agregar un fragmento SQL reutilizable
   `LATEST_REASON`: el reason del handoff más reciente de `chat.id`.
   - `(select h."reason" from "ai_chatbot"."Handoff" h where h."chatId" = <chat>."id" order by h."createdAt" desc limit 1)`.
   - Parametrizado por el alias de la tabla chat, para usarlo en `getChats`
     (tabla `chat`) y en el CTE de `getCustomerInbox` (alias interno).
   - Lo aprovecha el índice existente por `chatId`; si hace falta, sumar
     `Handoff(chatId, createdAt)` en una migración aditiva.

2. `getChats`: nuevo parámetro `handoffReason?: string`, que agrega
   `LATEST_REASON = handoffReason` a `filterConditions`.

3. `getCustomerInbox`: nuevo parámetro `handoffReason?: string`, y el CTE
   `latest` elige la conversación según la vista:
   - `status=closed`: `where closedAt is not null` antes del `distinct on`
     (la cerrada más reciente).
   - Cualquier otra vista (abierta o bandeja por defecto): `where closedAt is
     null` antes del `distinct on` (la conversación en curso).
   - Se agrega la columna `"reason"` (`LATEST_REASON`) y, con
     `handoffReason`, el filtro `r."reason" = ${handoffReason}`.
   - `conversationCount` sigue contando todas las conversaciones del cliente:
     se calcula en un CTE aparte sobre todas y se une por `customerKey`.

4. `getConversationCounts`: suma `byHandoffReason` a `ConversationCounts` (con
   `complaint`, `retention` y `case_status` inicializados en 0).
   - Sin `byCustomer`, una query agregada sobre `chat` con `closedAt is null`
     y `handledBy in HUMAN_HANDLED_BY`, agrupada por `LATEST_REASON`.
   - Con `byCustomer`, dos subqueries `DISTINCT ON (CUSTOMER_KEY)`: una sobre
     las conversaciones con `closedAt is null` (en curso), de la que salen
     `total`, `byUseCase`, `withoutUseCase`, `unattended`, `mine`, `aiAgent`,
     `withAdvisor` y `byHandoffReason` (este con `handledBy in
     HUMAN_HANDLED_BY`, agrupado por `LATEST_REASON`); otra sobre las cerradas,
     de la que sale `resolved`.
   - En la misma query, `withAdvisor`: el conteo de filas con
     `handledBy = 'human_agent'` sobre la misma base (abiertas; o la
     conversación en curso por cliente con `byCustomer`).
   - Se ejecuta en paralelo con la query actual de contadores.

---

## Group 2: Rutas

5. En `back/server/src/routes/advisor.ts`, leer `req.query.handoffReason` en
   `GET /conversations` y pasarlo a `getChats` y a `getCustomerInbox`. Con
   `handoffReason`, la bandeja humana por defecto (`humanInbox`) sigue aplicando.

6. `back/server/src/demo-customers.ts`:
   - Sumar a `DEFAULT_DEMO_CUSTOMERS`
     `{ token: 'demo-mx-2', label: 'Eduardo · México', customerId: 'CLI-0IY07CEBUL79' }`.
   - Agregar `tokenForCustomerId(customerId)`: el primer token no vencido con
     ese `customerId`, o `undefined`.

7. En `back/server/src/routes/chat.ts`, en `GET /:id`, sumar
   `demoCustomerToken: chat.customerId ? tokenForCustomerId(chat.customerId) ?? null : null`
   a la respuesta, junto a `agentPending`.

---

## Group 3: Siembra en local

8. Actualizar `back/scripts/scenarios/06-estado-reclamo.json` a
   `sessionToken: demo-mx-2` y a mensajes del flujo 3.D2: pide el estado,
   elige un reclamo, pide algo más (un plazo), confirma.
   - Depende de que el agente local acepte `demo-mx-2` y tenga `get_cases`
     (bloque c de w1:p3).

9. Clientes demo locales (pedido de w1:p4): 7 clientes reales Active del
   warehouse con tarjeta de crédito y movimientos, además de los 4 actuales.
   Van en `DEMO_CUSTOMERS_JSON` del `.env` de back-runtime y en
   `DEMO_SESSIONS_JSON` del agente local, no en los defaults.
   - México: `demo-mx-3` Fernando (`CLI-OAZTV7GG5M0D`) y `demo-mx-4` Victoria
     (`CLI-01OSDSMM4FX2`).
   - Colombia: `demo-co-2` Gustavo (`CLI-TVX8Q10GJDTW`) y `demo-co-3` Pilar
     (`CLI-JLLEM8RQT11E`).
   - Argentina: `demo-ar-2` Adriana (`CLI-2MM9EXMOO8KD`), `demo-ar-3` Antonio
     (`CLI-MO9NTQLU8K63`) y `demo-ar-4` Marco (`CLI-BTHO9TGJDB68`).

10. Crear `back/scripts/seed-console.ts` (`npm run seed:console`, `--only`
    para re-sembrar algunos clientes). Juega la matriz en serie contra `:3200`
    y el agente local: las conversaciones van por el simulador (que pasa a
    exportar sus helpers) y las acciones de asesor por la API. Al final
    imprime la tabla cliente → vista esperada y real, y los contadores.
    - Rechaza cualquier destino que no sea local.
    - La matriz, un cliente por fila:
      - Con AI y 3+ conversaciones: Daniela (resuelta por IA, asistida y una
        en curso).
      - En espera por motivo: Santiago (complaint), Javier (retention) y
        Eduardo (case_status, al final, cuando el agente lo derive).
      - Con asesor: Fernando tomado por asesor1 (complaint) y Gustavo tomado
        por asesor2 (retention).
      - Resuelta por IA: Adriana. Resuelta por humano: Victoria.
      - Borde de la regla: Pilar, con un reclamo resuelto y una cancelación en
        espera.
      - Borde del hueco: Antonio, con una cancelación abierta y una conversación
        más nueva resuelta.
      - Handoff devuelto a David: Marco.

11. Correr `npm run seed:console` y revisar la tabla. Re-sembrar con `--only`
    a quien no haya terminado en su vista, porque el agente es un LLM.

---

## Group 4: Tests

12. Unit: ampliar `back/tests/ai-sdk-provider/demo-customers.test.ts` con
    `demo-mx-2` en la lista por defecto y con `tokenForCustomerId`: devuelve
    el token no vencido, `undefined` para un id desconocido, y nunca devuelve
    `demo-expired` aunque comparta id con `demo-mx-1`.

13. Integration: el proyecto no tiene una capa de integración separada.
    Las queries se prueban de punta a punta a través de las rutas, con la
    base real y handoffs sembrados con `openHandoff` y `closeHandoffs`.

14. End-to-end: crear `back/tests/routes/reason-filter.test.ts`. Siembra por
    un `userId` único al test, con `saveChat`, `updateChatAgentState` y
    `openHandoff`, y cubre:
    - `?handoffReason=complaint` sin `groupBy`: trae solo las conversaciones con
      motivo complaint.
    - `groupBy=customer&handoffReason=complaint`: un cliente con una conversación
      resuelta con complaint y otra en curso con retention aparece solo en
      retention, con la conversación en curso como fila.
    - `counts` sin y con `groupBy`: `byHandoffReason` cuenta según la base de
      `total`, con las tres claves presentes.
    - Un cliente con una conversación abierta en `human_queue` y otra más
      nueva ya resuelta aparece en la Bandeja agrupada con la abierta, y cuenta
      en `total` y `unattended`.
    - `GET /api/chat/:id` trae `demoCustomerToken` para un chat creado con
      `demo-mx-2`, y `null` para un chat sin cliente.
    - Sin `handoffReason`, las respuestas no cambian: los tests existentes siguen en
      verde.
