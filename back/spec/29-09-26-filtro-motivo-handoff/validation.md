# Validation: Filtro por motivo de derivación, cliente demo Eduardo y cliente guardado del chat

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [ ] `npm run test:with-db` (routes + unit, base nueva) en 0
- [ ] `npm run test:ephemeral` (routes + unit) en 0
- [ ] `reason-filter.test.ts` con `--repeat-each 3 --retries 0` en 0
- [ ] `npx tsc --noEmit`, `npm run build:server` y `npm run db:check` en 0
- [ ] `cd front && npm run build` contra la rama

### Specific test coverage required

#### Unit

- [ ] `tokenForCustomerId` devuelve el token no vencido de ese cliente,
      `undefined` para un id desconocido, y nunca `demo-expired`
- [ ] `demo-mx-2` está en la lista por defecto con `CLI-0IY07CEBUL79`

#### Integration

- [ ] Sin capa separada: las queries se cubren a través de las rutas, con la
      base real (ver End-to-end)

#### End-to-end

- [ ] `?handoffReason=complaint` trae solo las conversaciones cuyo handoff más
      reciente es complaint
- [ ] `groupBy=customer&handoffReason=X` evalúa la conversación en curso: un
      reclamo anterior ya resuelto no pone al cliente en complaint
- [ ] En toda vista abierta agrupada, la fila es la conversación en curso:
      un cliente con una conversación abierta en `human_queue` y otra más
      nueva ya resuelta aparece en la Bandeja con la abierta
- [ ] Resueltas agrupada muestra la conversación cerrada más reciente
- [ ] `counts.withAdvisor` cuenta las conversaciones (o los clientes, con
      `groupBy=customer`) en curso en `human_agent`
- [ ] `counts.byHandoffReason` trae las tres claves y coincide con la base de
      `total`, con y sin `groupBy`, y respeta `userId`
- [ ] `GET /api/chat/:id` trae `demoCustomerToken` (`demo-mx-2` para un chat de
      Eduardo, `null` sin cliente) y sigue sin traer `customerId`
- [ ] Sin `handoffReason`, las listas y contadores responden igual (suite existente
      en verde)

## Manual Checks

- [ ] `npm run simulate -- --scenario 04-reclamo-cargo`, `05-cancelar-tarjeta`
      y `06-estado-reclamo` contra `:3200` dejan casos derivados en
      `chatbot_dev`
- [ ] `curl` a `counts?groupBy=customer` en `:3200` muestra `byHandoffReason` con al
      menos un caso por motivo (o `case_status` en 0, anotado, si el agente
      local todavía no lo deriva)
- [ ] `curl` a `conversations?groupBy=customer&handoffReason=retention` en `:3200`
      trae a Javier con su conversación en curso
- [ ] `GET /api/chat/:id` de un chat creado por el simulador trae el
      `demoCustomerToken` de su cliente

## Post-deploy Checks

- [ ] Después del redeploy, la consola de la App filtra por motivo y los
      contadores cargan sin errores en los logs

## Definition of Done

Todas las casillas marcadas, el contrato enviado al front (w1:p6), y el spec
revisado por w1:p4 antes de `/spec-implement`.
