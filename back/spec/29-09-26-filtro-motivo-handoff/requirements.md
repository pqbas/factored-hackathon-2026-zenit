# Requirements: Filtro por motivo de derivación, cliente demo Eduardo y cliente guardado del chat

La consola filtra hoy por `chat.useCase`, la última intención del
clasificador. Ese valor cambia en cada turno e incluye intenciones que nunca
llegan a un humano. Según `docs/flujo-atencion.md` (etapa 5), a la bandeja
solo llegan tres motivos de derivación: `complaint`, `retention` y
`case_status`. Esta fase hace tres cosas:

- filtra y cuenta por el motivo del handoff (tabla `Handoff`, Fase 6);
- suma a Eduardo (`demo-mx-2`) como cliente demo y siembra casos derivados en
  local para probar los filtros;
- expone el cliente guardado de cada chat, para que el front no dependa de
  `localStorage`.

No cambia el esquema de la base ni los contratos existentes: los parámetros y
campos nuevos son aditivos.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. `GET /api/advisor/conversations` (con y sin `groupBy=customer`) y
   `/conversations/counts` responden igual que hoy cuando no reciben
   `handoffReason`. Siguen funcionando `useCase`, `byUseCase` y todos los demás
   filtros y contadores.
2. Las rutas del cliente no exponen `customerId`, `customerName` ni datos del
   handoff.
3. Los tokens demo existentes (`demo-mx-1`, `demo-co-1`, `demo-ar-1`,
   `demo-closed`, `demo-expired`) mapean a los mismos clientes.

And it changes in these ways:

4. El motivo de una conversación es el `reason` de su handoff más reciente
   (abierto o cerrado), o ninguno si nunca derivó.
5. La conversación en curso de un cliente es su conversación más reciente no
   resuelta (`closedAt` nulo).
6. `GET /api/advisor/conversations?handoffReason=<motivo>`, sin `groupBy`, trae solo
   las conversaciones cuyo motivo es ese. Se combina con los demás filtros.
7. Con `groupBy=customer&handoffReason=<motivo>`, trae los clientes cuya
   conversación en curso tiene ese motivo. La fila de cada cliente es esa
   conversación en curso. Las conversaciones anteriores o ya resueltas no
   cuentan, y los demás filtros (`handledBy`, `assignedTo`, `userId`) se
   aplican a esa misma conversación.
8. `/conversations/counts` suma `byHandoffReason: { complaint, retention,
   case_status }` y `withAdvisor`.
   - Siempre trae esas tres claves, en 0 si no hay casos. Otro motivo que
     aparezca se suma como clave extra.
   - Sin `groupBy`, cuenta conversaciones abiertas atendidas por un humano
     (la misma base que `total`) según su motivo.
   - Con `groupBy=customer`, cuenta clientes según el motivo de su
     conversación en curso, cuando esa conversación la atiende un humano.
   - `withAdvisor` cuenta lo que muestra la vista "Con asesor"
     (`handledBy=human_agent`): conversaciones abiertas en `human_agent`, o
     clientes cuya conversación en curso lo está con `groupBy=customer`.
   - Respeta `userId` como los demás contadores.
9. `demo-mx-2` es un cliente demo: Eduardo, México, `CLI-0IY07CEBUL79`.
   Aparece en `GET /api/demo-customers` y funciona en `/api/chat`, en
   `/api/products` y en el historial por cliente.
10. `GET /api/chat/:id` suma `demoCustomerToken: string | null`, el token demo
    que corresponde al `customerId` guardado del chat (el primero no vencido
    con ese id), o `null` si el chat no tiene cliente o su id no es de un
    cliente demo.
11. En `chatbot_dev` hay al menos un caso derivado por motivo: un reclamo de
    Santiago (`complaint`), una cancelación de Javier (`retention`) y un
    estado de reclamo de Eduardo (`case_status`). Se generan con el
    simulador contra `:3200` y el agente local.

## 2. Decisions

- El motivo sale del handoff más reciente de la conversación, abierto o
  cerrado, porque es un dato que no cambia turno a turno como `useCase`. Una
  conversación devuelta a David conserva su motivo, y la vista (bandeja,
  Con AI, Resueltas) decide si se muestra.
- En la vista agrupada, `handoffReason` se evalúa sobre la conversación en curso del
  cliente (la más reciente con `closedAt` nulo), no sobre la más reciente a
  secas. Es la regla del usuario (vía w1:p4): un cliente está en "Reclamo"
  por lo que le pasa ahora, no por un reclamo anterior ya resuelto.
- Con `handoffReason`, la fila agrupada muestra la conversación en curso, porque es
  la que explica por qué el cliente está en ese filtro.
- Sin `handoffReason`, la fila agrupada sigue siendo la conversación más reciente,
  como hoy. Extender "conversación en curso" a todas las vistas abiertas sería
  más coherente, pero cambia listas que hoy funcionan; queda como propuesta
  para que el usuario decida.
- `counts.byHandoffReason` usa la misma base que `total` (en curso y atendida por un
  humano), porque así cada contador coincide con lo que muestra la bandeja
  con ese filtro.
- `useCase` y `byUseCase` se mantienen, porque el front los usa hoy y
  sacarlos rompería la consola desplegada. El front deja de usarlos y se
  pueden quitar después.
- Los nombres de los campos (`handoffReason`, `byHandoffReason`,
  `withAdvisor`, `demoCustomerToken`) son los que propuso el front (w1:p6),
  porque dicen de dónde sale cada dato y el front ya los tenía en su spec.
- `demoCustomerToken` expone el token demo y no el `customerId`, porque es lo
  que el front ya maneja para el selector de cliente, y mantiene la regla de
  no exponer `customerId` al cliente.
- `demo-mx-2` también tiene que existir en `agent/src/db/session_repo.py`
  para que el agente lo acepte. Lo hace w1:p3 en su bloque (c); el back solo
  lo agrega a su lista.
- El escenario 06 (estado de un reclamo) pasa a Eduardo (`demo-mx-2`),
  porque tiene reclamos reales en `customer_cases`. Sus mensajes se ajustan
  al flujo 3.D2 para que termine derivando con `case_status`.
- Los casos se siembran solo en local (`chatbot_dev`). Contra prod no, sin OK
  del usuario, porque cuesta LLM y warehouse.
- Fuera de alcance / futuro: ordenar la bandeja por prioridad y quitar
  `useCase` y `byUseCase` del contrato.

## 3. Context

- `spec/roadmap.md`: Fase 6 (handoff) y consola agrupada por cliente (Fase
  5); esta fase las extiende.
- `docs/flujo-atencion.md`: etapa 5 (los tres motivos) y 3.D2 (estado de un
  reclamo y cuándo deriva con `case_status`).
- Patrones existentes:
  - `back/packages/db/src/queries.ts`: `getChats` (filtros), `getCustomerInbox`
    (CTE `latest` con `DISTINCT ON`), `getConversationCounts` (`byCustomer`
    con subquery) y `getLatestHandoffs`.
  - `back/server/src/routes/advisor.ts`: parseo de filtros y bandeja humana
    por defecto.
  - `back/server/src/demo-customers.ts`: lista de clientes demo.
  - `back/server/src/routes/chat.ts`: `GET /:id`, que ya agrega `agentPending`.
  - `back/scripts/scenarios/*.json` y `npm run simulate`: siembra de casos.
