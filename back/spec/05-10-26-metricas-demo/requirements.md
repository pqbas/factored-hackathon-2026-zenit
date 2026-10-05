# Requirements: Datos demo para las métricas de resolución

Pedido del usuario vía w1:pB (05-10-26): para la demo del hackathon, la pantalla
"Métricas de resolución" (`GET /api/advisor/metrics`, tabla `ResolutionEvent`)
tiene que mostrar varios días con las tres categorías (IA, asistidas, asesor).
El usuario eligió "ambos": datos sintéticos con fecha pasada para los días que
no tuvieron tráfico, y tráfico real del día contra el back de AWS.

No cambia el esquema `ai_chatbot`, ni las rutas del back, ni el front.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. `simulate:day` contra un back local o una App de Databricks funciona igual
   (mismos flags, misma identidad de la CLI, mismo archivo de la corrida).
2. `simulate:cleanup` de un día simulado funciona igual.
3. Sin `--allow-prod`, ningún script corre contra algo que no sea localhost.

And it changes in these ways:

4. `npm run simulate:backfill -- --from 2026-10-01 --to 2026-10-04` inserta, por
   día, entre ~25 y ~40 chats cerrados de clientes reales de `bank_ro` (menos
   el fin de semana), cada uno con un intercambio corto (es, ~20% pt) y un
   `ResolutionEvent` con `resolvedAt` en horario de atención de America/Lima.
5. La mezcla apunta a ~65% resueltas por la IA, ~20% asistidas (IA con
   intervención humana) y ~15% resueltas por un asesor. Los casos de uso son
   las claves que el front ya etiqueta (`GENERAL_INQUIRY`, `CASE_STATUS`,
   `COMPLAINT`, `CANCEL`, `COMMERCIAL`, `HUMAN_AGENT`, y sin caso → "Otras").
6. Los chats sintéticos quedan cerrados (`closedAt`, `handledBy = ai_agent`):
   no aparecen en la Bandeja ni como abiertos en "Con AI". Los que tuvieron
   humano tienen su `Handoff` cerrado.
7. Todo lo sintético se distingue: `userId = demo-backfill` y el título empieza
   con `[demo]`. Cada id insertado queda en
   `scripts/simulate/runs/backfill-<from>_<to>.json`.
8. `simulate:backfill -- --cleanup --file <json>` borra exactamente lo que ese
   archivo registra (y nada que no sea `demo-backfill`).
9. `--dry-run` imprime el plan por día y categoría sin conectarse a escribir;
   sin `--allow-prod` el script solo acepta `SIM_PG_URL` local.
10. `simulate:day` corre contra el back de AWS (`*.awsapprunner.com`, password
    mode): inicia sesión con `POST /api/login` usando `SIM_ADMIN_USER` y
    `SIM_ADMIN_PASSWORD` del entorno y usa esa cookie para el cliente y el
    admin.
11. Con `--advisor-share <0..1>`, al terminar las conversaciones un asesor
    (el mismo admin) toma esa fracción de los handoffs: la mitad la resuelve
    (→ asesor) y la otra mitad la devuelve a David y el cliente se despide
    (→ asistida). El resto queda en la Bandeja, como hoy.

## 2. Decisions

- Los días pasados se insertan por SQL y no por la API, porque la API no deja
  fechar hacia atrás (`simulate/README.md`, "No backdating").
- Los datos sintéticos se marcan y se registran en un archivo, porque las
  métricas mostradas son de demo y tienen que poder quitarse; borrar en prod
  sigue siendo decisión explícita del usuario (no se corre en esta fase).
- No se insertan `TurnMetric` sintéticos, porque la pantalla de métricas no
  muestra latencia ni costo; así los números de costo siguen siendo reales.
- Cada chat sintético es de un cliente real de `bank_ro`, elegido con el mismo
  selector de `simulate:day` (`pickCustomers`: nunca un cliente demo ni uno con
  sesión simulada, y tampoco uno que ya tenga un chat `demo-backfill`), para
  que el panel del cliente en la consola muestre sus productos y movimientos
  reales (pedido del coordinador, 05-10-26).
- Los mensajes usan los datos de ese cliente cuando es barato: "Consultas
  generales" nombra su tarjeta o cuenta real (últimos 4, saldo y límite de
  `customer_products`), "Reclamo" su último cargo real (comercio, monto,
  fecha) y "Estado de un reclamo" la categoría de su caso real.
- En AWS cliente y admin son el mismo usuario (la cookie del admin), igual que
  en Databricks, donde los dos son el usuario de la CLI.
- `assertLocalBase` acepta `*.awsapprunner.com` con `--allow-prod`, porque AWS
  es el único despliegue activo (fase 24).
- Las contraseñas solo se leen del entorno; nunca van a archivos ni a logs.

## 3. Context

- `back/scripts/simulate/` (day.ts, common.ts, args.ts, cleanup.ts, pick.ts) y
  su README.
- `back/packages/db/src/schema.ts`: `Chat`, `Message`, `Handoff`,
  `ResolutionEvent`.
- `back/packages/db/src/queries.ts`: `getResolutionMetrics`, `releaseChat`,
  `resolveChatByAgent` (cómo se escriben los eventos reales).
- `back/server/src/routes/advisor.ts`: take, release (`resolved` /
  `returned_to_agent`).
- `front/src/lib/advisor.ts`: `USE_CASES`, `OTHER_GROUP`.
- `back/scripts/eval/guard.ts`: `assertLocalBase`.
