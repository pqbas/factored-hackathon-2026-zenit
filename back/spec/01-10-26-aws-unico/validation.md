# Validation: AWS como único despliegue activo

## Automated Tests

- [x] `npx tsc --noEmit` en 0 (no cambia código de la aplicación)

### Specific test coverage required

#### Unit

- [x] Sin código de la aplicación nuevo

#### Integration

- [x] Sin capa separada

#### End-to-end

- [ ] Manual, ver abajo

## Manual Checks

- [x] `migrate.sh` sin argumentos contra prod: 14 aplicadas, 0 pendientes,
      y lista las tablas que la identidad no posee
- [ ] El servicio de AWS queda RUNNING con `AGENT_QUEUE_WORKER=on` y el log
      muestra "Worker started"
- [ ] Las Apps de Databricks siguen STOPPED
- [ ] `lakebase-owner.sql` aplicado y `migrate.sh` ya no lista tablas
      ajenas. Pendiente por decisión de w1:pB (01-10-26): no se crea ningún
      secreto del principal de la App; el usuario lo decide cuando aparezca
      una migración nueva

## Definition of Done

Todas las casillas marcadas, salvo el traspaso de propiedad, que queda
pendiente. Las casillas de AWS se marcan al encender la cola, después del
merge.
