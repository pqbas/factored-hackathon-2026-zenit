# Validation: David se pausa después de derivar

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [ ] `npm run test:with-db` (routes + unit, base nueva) en 0
- [ ] `npm run test:ephemeral` (routes + unit) en 0
- [ ] `pause-after-handoff.test.ts` y `agent-queue.test.ts` con
      `--repeat-each 3 --retries 0` en 0
- [ ] `npx tsc --noEmit`, `npm run build:server` y `npm run db:check` en 0
- [ ] `cd front && npm run build` contra la rama

### Specific test coverage required

#### Unit

- [ ] `isPaused` es `true` con un handoff abierto o con `handledBy` distinto de
      `ai_agent`, y `false` solo con `ai_agent` sin handoff abierto
- [ ] `trimAfterHandoff` corta todo lo posterior a la frase de derivación (en
      partes siguientes y en la misma parte), en español y en portugués, y no
      toca las partes sin frase

#### Integration

- [ ] Sin capa separada: los caminos se cubren por las rutas (ver End-to-end)

#### End-to-end

- [ ] Un turno que deriva cancela los turnos encolados detrás en ese chat:
      queda un solo mensaje de David
- [ ] Un mensaje que llega mientras David todavía responde se encola
      (`data-agent-pending`) y, si ese turno derivó, se descarta sin respuesta
- [ ] Tomar un chat cancela sus turnos pendientes
- [ ] Un chat con handoff abierto no llama al agente aunque `handledBy` sea
      `ai_agent`
- [ ] `custom_outputs.paused = true` no guarda mensaje ni aplica outputs
- [ ] Cada llamada al agente lleva `custom_inputs.handled_by`
- [ ] El mensaje guardado de un turno de derivación termina en la frase de
      derivación aunque el agente mande texto después
- [ ] Un turno vencido deja un handoff abierto `agent_unavailable`, además del
      aviso y de `human_queue`

## Manual Checks

- [ ] En `:3200` con el agente local, el escenario 04 deriva y un mensaje
      posterior del cliente no recibe respuesta de David (el log no muestra
      request al agente)
- [ ] Con el agente de w1:p3 que devuelve `paused`, un mensaje en un chat
      derivado no guarda mensaje vacío

## Definition of Done

Todas las casillas marcadas, el contrato del punto 8 confirmado con w1:p3, y
el spec revisado por w1:p4 antes de `/spec-implement`.
