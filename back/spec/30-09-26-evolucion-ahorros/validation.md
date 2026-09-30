# Validation: Evolución de los ahorros del cliente

La fase está lista para mergear cuando se cumple todo lo que sigue.

## Automated Tests

- [x] `npm run test:with-db` (base nueva, migrada) en 0, una sola suite a la vez (304 passed)
- [x] `npx tsc --noEmit` y `npm run build:server` en 0
- [x] `cd front && npm run build` en 0

### Specific test coverage required

#### Unit

- [x] `buildSavingsHistory`: meses, suma por moneda, negativo fuera, serie
      plana, sin cuentas, movimiento del mes en curso

#### Integration

- [x] Fixture de Daniela con fechas relativas a `now()`

#### End-to-end

- [x] Daniela: solo ARS, 12 meses, saldos esperados
- [x] Javier: serie plana; Santiago: `[]`
- [x] 400/401/403 y token `sim-`

## Manual Checks

- [x] Contra el Lakebase de prod, en local y de solo lectura: Natalia
      (demo-mx-5) baja de ~16k a 2,508.39 (16,295.89 en 2026-03, 11,836.31
      en 2026-04 y 2,508.39 desde 2026-05)

## Definition of Done

Todas las casillas marcadas y la spec revisada por w1:p4 antes de
`/spec-implement`.
