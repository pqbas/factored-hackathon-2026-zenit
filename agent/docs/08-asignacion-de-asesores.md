# 8. Asignación de asesores

Cuando el agente deriva, el handoff no queda en una bandeja general: se le
asigna a un asesor según su perfil, y el asesor recibe junto con él un resumen
de la conversación. Así se entera de que tiene un caso nuevo y sabe de qué se
trata sin leer todo el chat.

La asignación, la disponibilidad de los asesores y la consola son del back. El
agente solo emite la señal de handoff con su `packet` (ver
[Límites entre el agente y el back](../../docs/limites-agente-back.md)).

## 8.1 Perfil del asesor

El perfil ya existe en `workspace.bank_silver.service_agents` (1,200 asesores),
y se lee de ahí sin duplicarlo:

| Campo              | Valores                                                                                         | Para qué                              |
| ------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------- |
| `specialty`        | Fraudes, Cobranza, Soporte Técnico, Retención, Créditos, Inversiones, Ventas o sin especialidad | Qué casos puede atender               |
| `languages`        | español, inglés, portugués (uno o varios)                                                       | Atender en el idioma del cliente      |
| `agent_status`     | Active, Vacation, Leave, Inactive                                                               | Solo `Active` recibe casos            |
| `work_shift`       | Morning, Afternoon, Night, Rotating                                                             | Quién está en turno                   |
| `agent_type`       | Phone, Digital, In-Person, Hybrid                                                               | El chat va a `Digital` e `Hybrid`     |
| `experience_level` | Junior, Mid-Senior, Senior, Specialist                                                          | Los casos de riesgo van a los seniors |
| `email`            |                                                                                                 | Une el login de la consola al perfil  |
| `avg_csat`         |                                                                                                 | Desempate                             |

Lo que `service_agents` no tiene es el estado en tiempo real. Eso va en una
tabla de **la base del back**, unida por `agent_id`:

### 8.1.1 `advisor_availability`

| Campo            | Qué guarda                                                     |
| ---------------- | -------------------------------------------------------------- |
| `agent_id`       | El asesor (`service_agents.agent_id`).                         |
| `online`         | Si tiene la consola abierta y está disponible.                 |
| `open_handoffs`  | Cuántos handoffs tiene asignados sin cerrar.                   |
| `max_concurrent` | Cuántos puede atender a la vez (por ejemplo 3).                |
| `last_seen_at`   | Último latido de la consola; si pasa un minuto, queda offline. |

## 8.2 Especialidad por motivo

| Motivo o caso de uso                           | Especialidad    | Experiencia mínima |
| ---------------------------------------------- | --------------- | ------------------ |
| `guardrail_risk` (estafa en curso)             | Fraudes         | Senior             |
| UC-02 Quejas: cargo no reconocido              | Fraudes         | —                  |
| UC-02 Quejas: otras quejas                     | Cualquiera      | —                  |
| Técnico                                        | Soporte Técnico | —                  |
| `commercial`                                   | Ventas          | —                  |
| `retention`                                    | Retención       | —                  |
| `customer_request`, `no_match`, `tool_failure` | Cualquiera      | —                  |

La tabla es fija en el código del back, que la aplica al `reason` y al caso de
uso que llegan en `custom_outputs.handoff`.

## 8.3 Reglas de asignación

El back las aplica; el agente no participa.

1. **Al crear el handoff**, en la misma transacción, se busca un asesor que:
   - esté `Active`, en turno y `online`;
   - sea `Digital` o `Hybrid`;
   - hable el idioma del cliente (el que el agente deduce del historial y manda
     en el `packet`);
   - tenga la especialidad y la experiencia que pide la tabla;
   - tenga `open_handoffs < max_concurrent`.

   Entre los que cumplen, gana el de menos casos abiertos, y después el de
   mejor `avg_csat`. La fila del asesor se bloquea (`FOR UPDATE SKIP LOCKED`)
   para que dos handoffs simultáneos no se la asignen al mismo tiempo. El
   handoff queda `assigned`, con `assigned_to` y `assigned_at`, y
   `open_handoffs` sube en uno.
2. **Si no hay nadie**, el handoff queda `pending` en la cola de esa
   especialidad. Cuando un asesor se conecta o cierra un caso, toma el
   pendiente de mayor `priority` y, a igual prioridad, el más antiguo.
3. **Si la especialidad no tiene a nadie en 5 minutos**, la búsqueda se abre a
   cualquier asesor que cumpla el resto. Los de `guardrail_risk` se abren de
   inmediato a cualquier Senior o Specialist: una estafa en curso no espera.
4. **Si el asesor no responde en 3 minutos** (`first_response_at` vacío), el
   handoff vuelve a la cola y se asigna a otro. El primer asesor queda
   registrado en el historial del handoff.
5. **Al cerrar**, `open_handoffs` baja en uno y el asesor queda libre para el
   siguiente de la cola.

Los tiempos (5 y 3 minutos, `max_concurrent`) son valores iniciales para
calibrar.

## 8.4 Notificación al asesor

La consola consulta cada pocos segundos sus handoffs asignados
(`GET /handoffs?assigned_to=me`) y muestra una alerta cuando aparece uno nuevo.
La misma consulta sirve de latido para `last_seen_at`.

## 8.5 Resumen para el asesor

El `packet` del handoff es lo primero que ve el asesor. Lo arma el agente y
llega al back en `custom_outputs.handoff`. Tiene dos partes:

| Parte   | Contenido                                                                                                                                                        | Cómo se genera                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Hechos  | Motivo y condición que se cumplió, caso de uso, `case_id`, idioma, datos verificados (por ejemplo la transacción disputada), herramientas llamadas y sentimiento | Del estado del agente, sin LLM |
| Resumen | Dos o tres líneas: qué quiere el cliente y qué quedó sin resolver                                                                                                | LLM, con la conversación       |

- **Los hechos no pasan por el LLM.** Salen del estado del grafo, así que son
  exactos.
- **El resumen no bloquea el handoff.** El agente lo genera antes de responder,
  con un tiempo límite corto; si falla o se pasa, deriva sin él.
- **El resumen no reemplaza el historial.** La consola muestra la conversación
  completa debajo.
- **Sin datos sensibles.** Números de tarjeta y similares se enmascaran antes de
  pasarle la conversación al LLM.

## 8.6 API

Son rutas del back y se suman a las de [Handoff](07-handoff.md#74-api):

| Método y ruta                  | Quién la llama | Qué hace                                           |
| ------------------------------ | -------------- | -------------------------------------------------- |
| `GET /handoffs?assigned_to=me` | Consola        | Los handoffs asignados al asesor; sirve de latido. |
| `POST /advisors/me/status`     | Consola        | El asesor se pone disponible o no disponible.      |

El asesor se identifica con el login de Databricks Apps (`X-Forwarded-Email`),
que se busca en `service_agents.email`. Si no está ahí o no está `Active`, la
consola no le asigna casos.

## 8.7 Métricas

- Tiempo hasta la asignación y hasta la primera respuesta, por especialidad.
- Cuántos handoffs se abrieron a cualquier asesor por falta de especialistas.
- Cuántos se reasignaron porque el asesor no respondió.
- Carga por asesor y por turno.

## 8.8 Estado

Pendiente. Hoy no hay asignación ni consola; las dos son trabajo del back. Los
emails de `service_agents` son ficticios, así que para la demo hay que agregar a
los asesores del equipo o mapear sus emails a asesores existentes.
