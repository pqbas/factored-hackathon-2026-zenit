# Validation: Simulación diaria de tráfico en prod

## Automated Tests

- [ ] `npm run test:with-db` y `npm run test:ephemeral` en 0; `tsc` y
      `build:server` en 0
- [ ] Unit: mezcla de motivos, plantillas de 2 a 4 mensajes, ~20% pt
- [ ] End-to-end: un token `sim-` vigente resuelve, uno vencido o desconocido
      no, y el chat guarda el `customerId`

## Manual Checks

- [ ] Con el agente de w1:p3 desplegado, `simulate:day --count 100` contra
      prod termina y escribe `runs/<fecha>.json`
- [ ] La consola de prod muestra las derivaciones en espera en la Bandeja y
      resueltas por la IA; ninguna tomada por un asesor
- [ ] `simulate:cleanup` sobre un día de prueba borra sus chats y sus
      sesiones
- [ ] El costo del día queda por debajo de USD 3

## Definition of Done

Todo lo anterior, la spec del agente de w1:p3 en main y desplegada, y el
resumen del día 1 enviado a w1:p4.
