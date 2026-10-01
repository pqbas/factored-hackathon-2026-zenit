# Plan: AWS como único despliegue activo

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `back/scripts/aws/setup.sh` | existente | Modificado: worker `on` por defecto, subcomando `env` |
| `back/scripts/aws/migrate.sh` | — | Nuevo |
| `back/scripts/aws/migrate-check.ts` | — | Nuevo: pendientes y propiedad, solo lectura |
| `back/scripts/aws/lakebase-owner.sql` | — | Nuevo: traspaso único de propiedad |
| `back/scripts/aws/README.md` | existente | Modificado: migraciones y cola |

## Group 1: Cola

1. `setup.sh service` crea el servicio con `AGENT_QUEUE_WORKER=on`.
2. `setup.sh env KEY=VALUE...` actualiza variables no secretas del servicio.
3. En AWS: `setup.sh env AGENT_QUEUE_WORKER=on`.

## Group 2: Migraciones

4. `migrate-check.ts`: cuenta las migraciones del repo y las aplicadas, y
   lista las tablas de `ai_chatbot` y `drizzle` que la identidad no posee.
5. `migrate.sh`: resuelve el host de Lakebase y el usuario del CLI, corre el
   chequeo y, con `--apply`, `npm run db:migrate`.
6. `lakebase-owner.sql`: crea `bank_assistant_owner`, suma los miembros y
   cambia el dueño de tablas, secuencias, tipos y schemas.

## Group 3: Tests

7. Unit e integration: no hay código de la aplicación nuevo.
8. End-to-end, manual: `migrate.sh` contra prod en modo consulta, y la cola
   en AWS con un turno encolado.
