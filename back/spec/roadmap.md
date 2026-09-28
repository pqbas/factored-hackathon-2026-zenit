# Roadmap

## Built so far

- Los usuarios que entran con el login de Databricks Apps pueden chatear con un
  endpoint de serving y ver la respuesta en streaming.
- Cada usuario ve solo su historial de chats y puede retomarlo. Con Lakebase el
  historial queda guardado; sin Lakebase vive en memoria.
- Si un stream se corta, se reanuda sin volver a llamar al modelo.
- El backend sirve la UI compilada desde `../front`.
- Quedan restos de un flujo anterior: la etapa, la intención y el nombre del
  cliente que se guardan en cada chat, y el aviso de "background check" en
  `/api/internal`.

---

## Phase 1: Identidad del cliente y conversación continua

**Goal:** que el agente sepa qué cliente escribe y recuerde la conversación
entre turnos.

- [ ] El usuario elige un cliente demo y cada mensaje llega al agente con su
      token de sesión.
- [ ] Todos los turnos de un chat llegan al agente como la misma conversación.
- [ ] Con un token inválido o vencido, el chat muestra la respuesta de "inicia
      sesión" que da el agente.
- [ ] Un test comprueba que el token y el id de conversación llegan al agente.

---

## Phase 2: Limpieza del flujo anterior

**Goal:** que en el backend no quede lógica de un producto que ya no existe.

<!-- Por decidir: borrar estos restos o reemplazarlos por el estado del agente
     bancario (caso de uso activo, quién atiende). -->

- [ ] Se quitan el aviso de "background check" y los campos de etapa, intención
      y nombre del cliente, o se reemplazan por el estado del agente bancario.

---

## Phase 3: El chat durante una derivación a asesor

**Goal:** que el cliente vea cuándo lo atiende un humano y lea sus mensajes sin
recargar la página.

<!-- Depende de que el agente exponga GET /conversations/{id}/messages
     (agent/docs/07-handoff.md §7.6). -->

- [ ] El chat muestra el aviso de que la conversación pasó a un asesor.
- [ ] Mientras el agente está en pausa, el chat no se queda esperando su
      respuesta.
- [ ] Los mensajes del asesor aparecen en el chat casi en tiempo real.

---

## Phase 4: Consola del asesor

**Goal:** que un asesor tome un caso derivado, responda al cliente y lo cierre.

<!-- Depende de las rutas /handoffs del agente. Por decidir: si la consola vive
     en este repo o en ../front. -->

- [ ] El asesor ve la bandeja de casos pendientes, ordenada por prioridad.
- [ ] El asesor abre un caso con su resumen y el historial del chat.
- [ ] El asesor toma el caso, responde y lo cierra indicando si vuelve al
      agente.
