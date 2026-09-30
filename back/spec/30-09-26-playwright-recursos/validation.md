# Validation: Los tests no agotan la memoria ni dejan procesos colgados

- [x] `npm run test:with-db` corrido solo: 290 pasan y 1 flaky, en 51 s
- [x] `npm run test:ephemeral`: 185 pasan
- [x] `npx tsc --noEmit` en 0
- [x] SIGTERM al wrapper a mitad de una corrida: `:3100` queda libre en 2 s,
      y no quedan navegadores ni procesos de la corrida
