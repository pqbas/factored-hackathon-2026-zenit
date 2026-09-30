# Requirements: Simulación diaria de tráfico en prod

Pedido del usuario vía w1:p4 (30-09-26): para la demo del hackathon, prod se
tiene que ver con tráfico real. Cada "día" de simulación corre 100
conversaciones de clientes reales del banco contra las Apps desplegadas: hoy
100, y otro día otras 100 cuando el usuario avise.

No cambia el esquema `ai_chatbot` ni los contratos con el front. Se suma el
schema `bank_sessions` en Lakebase (sesiones de la simulación), y el agente
(w1:p3) y el back resuelven esas sesiones.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. Los tokens demo de `DEMO_SESSIONS_JSON` / `DEMO_CUSTOMERS_JSON` siguen
   igual.
2. Un token desconocido o vencido se rechaza con el mismo mensaje de hoy.

And it changes in these ways:

3. `npm run simulate:day -- --count 100 --base <url> --allow-prod` corre un
   día de tráfico:
   - elige `count` clientes reales activos de `bank_ro`, sin repetir clientes
     de días anteriores ni los 13 clientes demo;
   - crea una sesión por cliente en `bank_sessions.sim_sessions`, con un token
     aleatorio `sim-<uuid v4>` que vence al final del día;
   - corre las conversaciones contra el back, como el usuario de la CLI.
4. La mezcla de motivos sigue `call_center_interactions`:

   | Motivo del call center | % | Caso nuestro |
   | --- | --- | --- |
   | Transaccional | 35 | saldo o movimientos de tarjeta o ahorro |
   | Producto | 22 | cupo, límite o saldo de un producto |
   | Queja | 17 | 12 reclamo por un cargo real y 5 estado de reclamo (clientes con reclamos) |
   | Técnico | 15 | fuera de alcance (la app, la clave, un cajero) |
   | Comercial | 8 | comercial (préstamo, seguro, cuenta nueva) |
   | Retención | 3 | cancelación de una tarjeta real |

   - Alrededor del 20% es en portugués.
   - Cada conversación tiene de 2 a 4 mensajes, con frases variadas y datos
     reales del cliente (últimos 4 de la tarjeta, comercio, monto, fecha).
   - Una parte se despide ("gracias, eso es todo") para que haya resueltas
     por la IA.
5. Después de las conversaciones, las derivaciones se reparten para que la
   consola se vea viva:
   - ~40% se toma y se resuelve;
   - ~20% se toma y se devuelve a David;
   - ~20% se toma y queda con asesor;
   - ~20% queda en espera.
6. Todo queda en un registro del día, `scripts/simulate/runs/<fecha>.json`,
   con cliente, motivo, idioma, `chatId`, resultado, duración y tokens de
   cada turno. El resumen trae:
   - cuántas por caso;
   - derivadas y resueltas;
   - p50/p95 por turno del runner y del back;
   - costo con `server/src/pricing.ts`.
7. `npm run simulate:cleanup -- --day <fecha> --base <url> --allow-prod`
   borra los chats de ese día (por `chatId`, por la API del back) y sus filas
   de `bank_sessions.sim_sessions`.
8. El back resuelve un token `sim-` que no está en `DEMO_CUSTOMERS_JSON`
   buscándolo en `bank_sessions.sim_sessions`, con una consulta fija por
   token y el chequeo de `expires_at`:
   - en el chat, para guardar `customerId`;
   - en `/api/products`;
   - en `/api/history`.
   Si Lakebase no responde, falla cerrado: el token no resuelve a ningún
   cliente.
9. El agente hace la misma búsqueda (w1:p3, su spec): falla cerrado y usa una
   consulta fija.

## 2. Decisions

- Las sesiones van en una tabla de Lakebase y no en `DEMO_SESSIONS_JSON`.
  - Así no hay que redesplegar el agente cada día.
  - Una sesión se revoca borrando su fila.
  - No hay secreto que repartir, a diferencia de HMAC (acordado con w1:p3).
  - Los tokens son aleatorios, así que nadie puede fabricar la sesión de
    otro cliente.
- Las tomas, devoluciones y resoluciones las hace el usuario admin de la CLI,
  no asesor1/asesor2. En prod, el proxy de la App identifica al usuario real
  y no se puede actuar como otro. La consola muestra al admin como asesor.
  Pendiente de confirmar con w1:p4.
- Las conversaciones se marcan por su `chatId` en el registro del día y por
  el token `sim-`. Todas van como el usuario de la CLI, y el título lo genera
  el back. No hay backdating: las fechas son las reales de la corrida.
- No hay clientes de Brasil en el dataset (México, Colombia, Argentina). Las
  conversaciones en portugués son clientes de esos países que escriben en
  portugués. Se declara en el resumen.
- Se corre con 3 conversaciones en paralelo, para que un día tome unos
  15 minutos sin forzar el endpoint de Qwen.
- Costo esperado: ~USD 0.50 de Qwen por día. Si la estimación del registro
  pasa de USD 3, se avisa.

## 3. Context

- `back/scripts/seed-console.ts`: pasos del asesor.
- `back/scripts/eval/run.ts`: auth contra una App desplegada y lectura de
  `/turns`.
- `back/server/src/demo-customers.ts`, `routes/chat.ts`, `routes/products.ts`
  y `routes/history.ts`: resolución del token.
- `back/server/src/bank-db.ts`: pool a Lakebase.
- `back/scripts/simulate/sessions.sql`: schema, tabla y grants (ya aplicado
  en prod).
