# Requirements: AWS como único despliegue activo

Decisión del usuario vía w1:pB (01-10-26): las Apps de Databricks quedan
apagadas (no se borran) y AWS es el único despliegue activo. Dos tareas que
hacía la App de Databricks pasan al back de AWS: contestar la cola de turnos
y aplicar las migraciones.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. El back de AWS sigue igual en todo lo demás: login, Lakebase, agente.
2. Las Apps de Databricks no se reinician ni se borran.

And it changes in these ways:

3. **Cola de turnos en AWS.** El servicio de AWS corre el worker
   (`AGENT_QUEUE_WORKER=on`). `setup.sh service` lo deja encendido por
   defecto, y `setup.sh env KEY=VALUE` cambia variables del servicio que ya
   corre.
4. **Migraciones como paso explícito.** `scripts/aws/migrate.sh`:
   - sin argumentos muestra cuántas migraciones hay pendientes y si la
     identidad puede aplicarlas; no cambia nada;
   - con `--apply` las aplica, y se niega si la identidad no es dueña de
     las tablas;
   - corre con la identidad de quien lo ejecuta (su CLI de Databricks),
     nunca con el service principal del back ni con el del agente.
5. **Propiedad de las tablas.** `lakebase-owner.sql` pasa una sola vez las
   tablas de `ai_chatbot` y `drizzle` a un rol `bank_assistant_owner`, del
   que son miembros el principal de la App de Databricks y quien migra.

## 2. Decisions

- El worker queda dentro del back, sin un servicio aparte: son 4 días y la
  cola solo se usa cuando el agente falla.
- Límite conocido de App Runner, documentado en el README: una instancia
  sin pedidos en curso casi no recibe CPU, así que el worker no corre con
  horario estricto mientras el servicio está en reposo. Los turnos en cola
  se contestan mientras hay tráfico (el chat abierto del cliente consulta
  al back) o con el siguiente pedido. Para un worker puntual haría falta un
  servicio siempre encendido (ECS) o una tarea programada.
- Las migraciones no corren en el arranque del contenedor: con varias
  instancias arrancarían a la vez, y el principal del back no debe tener
  DDL.
- Ni el SP del agente ni el del back reciben DDL (pedido de w1:pB).
- El traspaso de propiedad solo lo puede ejecutar el dueño actual, el
  principal de la App de Databricks. Requiere un secreto OAuth temporal de
  ese principal, que aprueba o crea el usuario. Hasta entonces `migrate.sh`
  informa y no aplica. Hoy no hay migraciones pendientes (14 de 14).
- Fuera de alcance: mover el worker a otro servicio y automatizar las
  migraciones en CI.

## 3. Context

- `back/server/src/agent-queue.ts` e `index.ts`: el worker y
  `AGENT_QUEUE_WORKER`.
- `back/scripts/migrate.ts`: el runner de migraciones (`npm run db:migrate`).
- `back/scripts/aws/`: `setup.sh`, `deploy.sh`, `lakebase-grants.sql`.
- Prueba hecha con ROLLBACK: `pcubasm1` (databricks_superuser) no puede
  alterar las tablas ni hacerse miembro del rol dueño.
