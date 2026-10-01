# Validation: AWS como único despliegue activo

## Automated Tests

- [ ] `npx tsc --noEmit` en 0 (no cambia código de la aplicación)

### Specific test coverage required

#### Unit

- [ ] Sin código de la aplicación nuevo

#### Integration

- [ ] Sin capa separada

#### End-to-end

- [ ] Manual, ver abajo

## Manual Checks

- [ ] `migrate.sh` sin argumentos contra prod: 14 aplicadas, 0 pendientes,
      y lista las tablas que la identidad no posee
- [ ] El servicio de AWS queda RUNNING con `AGENT_QUEUE_WORKER=on` y el log
      muestra "Worker started"
- [ ] Las Apps de Databricks siguen STOPPED
- [ ] (Con el secreto temporal del principal de la App) `lakebase-owner.sql`
      aplicado y `migrate.sh` ya no lista tablas ajenas

## Definition of Done

Todas las casillas marcadas, salvo la última, que depende de la decisión del
usuario sobre el secreto temporal.
