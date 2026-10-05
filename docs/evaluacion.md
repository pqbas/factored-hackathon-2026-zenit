# Evaluación de David

Qué resuelve David, medido con casos de prueba contra el sistema completo (back,
agente, LLM y datos del banco). Las cifras detalladas, los reportes de cada
corrida y el registro de cambios a los casos están en
[`back/scripts/eval/results/comparacion.md`](../back/scripts/eval/results/comparacion.md).

> Dos mediciones (29–30/09/2026), con el mismo LLM (Qwen 3 Next 80B) y los
> mismos datos del banco (Lakebase `bank_ro`):
>
> - **Offline, en local:** back y agente corriendo en local desde `main`.
> - **En producción:** el examen contra las Apps desplegadas en Databricks
>   ([`comparacion-prod.md`](../back/scripts/eval/results/comparacion-prod.md)).

## El problema, en datos

Línea base del servicio actual, medida sobre `call_center_interactions` del
dataset (686,296 contactos).

- **Canal:** el 85% de los contactos es por teléfono (583,250); el chat web,
  la app y WhatsApp suman ~10%.
- **Llamadas entrantes (480,678), por motivo:**

| Motivo | % de llamadas | Resueltas en la llamada | Requieren seguimiento | Duración mediana | Espera mediana | Horas de asesor |
| --- | --- | --- | --- | --- | --- | --- |
| Transaccional | 35.0% | 91.5% | 22.1% | 3.4 min | ~2 min | 10,306 |
| Producto | 22.0% | 89.6% | 23.9% | 4.4 min | ~2 min | 7,819 |
| Queja | 17.1% | 43.7% | 62.8% | 7.2 min | ~2 min | 9,943 |
| Técnico | 15.0% | 69.9% | 40.6% | 6.0 min | ~2 min | 7,201 |
| Comercial | 8.0% | 65.0% | 44.8% | 9.0 min | ~2 min | 5,750 |
| Retención | 3.0% | 60.5% | 48.9% | 8.0 min | ~2 min | 1,923 |

Por qué se eligieron estos flujos:

- **Consultas transaccionales (35%):** el cliente espera ~2 min y habla 3.4 min
  para un dato que David entrega en ~2 s por chat. Es el mayor volumen y el de
  menor riesgo: solo lectura.
- **Quejas (17%):** solo el 43.7% se resuelve en la primera llamada y el 62.8%
  requiere seguimiento. David no las resuelve: recolecta y verifica la ficha y
  la deriva, para que el asesor no tenga que volver a preguntar.
- **Retención (3%):** llamadas de 8 min con 60.5% de resolución. David
  recolecta producto y motivo y deriva; la retención la hace el asesor.

**Proyección, no medición.** David atiende por chat, no por voz. Las 10,306
horas de llamadas transaccionales son el techo de lo que se podría desviar del
teléfono al chat si esos clientes usaran el canal digital. No es un ahorro
medido: depende de la adopción del canal, que este prototipo no mide. La voz
queda como trabajo futuro ([`camino-a-produccion.md`](camino-a-produccion.md)).

## 1. Cómo se mide

- **Casos:** 60 conversaciones de prueba escritas a partir de §7 de
  [`flujo-atencion.md`](flujo-atencion.md), cada una con su resultado esperado:
  resolver, derivar con un motivo, respuesta fija o pedir un dato.
  - **Práctica (dev), 40 casos:** con ellos se corrigió al agente, así que su
    "después" puede estar sobreajustado.
  - **Examen (holdout), 20 casos:** escritos y congelados aparte; el equipo
    del agente nunca los vio. **Es la medición sin leakage.**
- **Clientes reales del dataset:** 13 clientes; cada tarjeta, cargo, monto y
  reclamo que nombra un caso existe para ese cliente. Lo único inventado es a
  propósito: un cargo inexistente (dato erróneo), un CVV y una contraseña (dato
  sensible).
- **3 corridas por caso**, para medir la variabilidad.
- **Veredicto determinista**, sin LLM juez: estado del chat, motivo de la
  derivación, ficha, respuestas fijas y patrones prohibidos por caso.
- **Cambios a los casos:** quedan registrados con fecha y motivo, y marcados si
  se hicieron después de ver resultados; un test impide cambiarlos en silencio.

## 2. Resultados (examen, 20 casos × 3)

| Métrica | Antes | Después |
| --- | --- | --- |
| Conversaciones que cumplen el flujo | 50/60 (83.3%) | **57/60 (95.0%)** |
| Resolución automática segura | 35/60 (58.3%) | **39/60 (65.0%)** |
| Containment (sin transferir) | 45/60 (75.0%) | 42/60 (70.0%) |
| Derivaciones correctas | 15/18 | **18/18** |
| Derivaciones faltantes / sobrantes | 3 / 0 | **0 / 0** |
| Resultados inseguros observados | 0 | **0** |
| Latencia por turno p50 / p95 | 10.7 s / 18.6 s | **5.2 s / 7.0 s** |
| Costo por caso intentado | USD 0.0058 | **USD 0.0048** |
| Costo por caso resuelto solo | USD 0.0133 | **USD 0.0109** |
| Mismo veredicto en las 3 corridas | 19/20 | **20/20** |
| Español / portugués | 82.1% / 85.7% | **100% / 85.7%** |

Containment baja a propósito: los casos que antes quedaban trabados sin llegar
al asesor ahora sí se derivan. La única falla del examen (H19, portugués) es del
back: la contraseña se guarda sin enmascarar; David la bloquea bien.

En los 40 de práctica: 71.7% → 95.8% de conversaciones que cumplen el flujo, y
p50 9.0 s → 5.3 s.

## 3. En producción (examen, 20 casos × 3)

| Métrica | Prod, antes del fix de MLflow | **Prod, después** | Local, después |
| --- | --- | --- | --- |
| Conversaciones que cumplen el flujo | 53/60 (88.3%) | **57/60 (95.0%)** | 57/60 (95.0%) |
| Resolución automática segura | 36/60 (60.0%) | **39/60 (65.0%)** | 39/60 (65.0%) |
| Derivaciones correctas | 17/18 | **18/18** | 18/18 |
| Resultados inseguros observados | 0 | **0** | 0 |
| Latencia por turno p50 / p95 | 2.2 s / 3.8 s | **2.0 s / 3.7 s** | 5.2 s / 7.0 s |
| Costo por caso resuelto solo | USD 0.0102 | **USD 0.0099** | USD 0.0109 |
| Mismo veredicto en las 3 corridas | 16/20 | **20/20** | 20/20 |

La calidad en prod es la misma que en local y la latencia es menos de la mitad:
en local, cada turno pagaba ~2 s de autenticación por la CLI al resolver el
experimento de MLflow, que la App no usa. La única falla (H19) es del back: la
contraseña se guarda sin enmascarar.

## 4. Qué resuelve David, por caso de uso (después)

| Caso de uso | Qué hace | Práctica | Examen |
| --- | --- | --- | --- |
| Consultas (saldo, límite, cupo, movimientos) | Resuelve solo con datos reales | 30/30 | 15/15 |
| Reclamo por un cargo | Recolecta y verifica la ficha, confirma y deriva | 15/15 | 9/9 |
| Cancelar un producto | Recolecta producto y motivo y deriva a retención | 9/9 | 6/6 |
| Estado de un reclamo | Informa el estado real o deriva si necesita más | 10/12 | 6/6 |
| Después de derivar | Se calla hasta que un asesor devuelve el chat | 6/6 | 3/3 |
| Ambiguos y fuera de alcance | Pide aclaración o muestra el menú; no deriva | 21/21 | 9/9 |
| Seguridad y fallas | Bloquea datos sensibles, manipulación y datos ajenos; sesión vencida; herramienta caída | 24/27 | 9/12 |

Las fallas restantes: #22 (estado de un reclamo sin reclamos previos: la ficha
de la derivación llega incompleta en 2 de 3 corridas) y #36/H19 (el back guarda
el CVV y la contraseña sin enmascarar).

## 5. Clasificador de intención (componente aprendido vs. baseline)

39 mensajes etiquetados de los casos de práctica × 3 repeticiones, solo el primer mensaje, sin el holdout.

| Clasificador | Exactitud | p50 | p95 | Nota |
| --- | --- | --- | --- | --- |
| Reglas de palabras clave (baseline) | 66.7% | ~0 s | ~0 s | Fallan en "mi reclamo" (estado) por el orden de las palabras clave |
| Reglas primero + Qwen si no están seguras | 82.1% | — | — | 33% de los mensajes llega al LLM |
| Jev | **92.3%** | **0.28 s** | **0.38 s** | No usable en prod: la App no tiene salida a internet |
| GPT-OSS 20B | 88.9% | 2.9 s | 4.6 s | 10% supera el timeout de 4 s |
| Llama 3.1 8B | 87.2% | 2.5 s | 4.7 s | 6% supera el timeout de 4 s |
| Gemma 3 12B | 0% | — | — | No devuelve la salida estructurada |
| **Qwen 3 Next 80B (prod)** | **94.9%** | 2.72 s | **3.26 s** | 2% supera 4 s; 0 errores de salida |

El clasificador evaluado y desplegado es Qwen; Jev es una alternativa externa que se midió en local. Se mantiene Qwen: es el más exacto y el más estable en la cola. Los modelos
chicos no bajan la latencia, porque el piso de ~2.5 s es del endpoint y no del
tamaño del modelo. Jev sería lo mejor (más exacto que los chicos y 10 veces más
rápido), pero la App no puede salir a internet. Las reglas ya se usan donde son
de alta precisión (letras del menú, confirmación, cancelación en curso,
seguimiento del estado de un reclamo), y en esos turnos no se llama al LLM.

## 6. Guard de grounding

Si David muestra datos de la cuenta sin haber llamado a la herramienta que los
devuelve, la respuesta se detiene y se reintenta una vez forzando la
herramienta; si falla, responde "Ahora no puedo consultar esa información.".
En la corrida "después" se disparó en 9 de 279 turnos (práctica) y 0 de 126
(examen); los 9 reintentos trajeron los datos reales.

## 7. Limitaciones

- **Prod medido solo con el examen:** 20 casos × 3; el resto de las cifras es
  offline.
- **Trazas de prod:** las trazas de MLflow no llegan desde la App (sin salida
  al storage); las métricas por turno vienen de `TurnMetric` en el back.
- **Muestra chica:** 60 casos. 0 inseguros observados no prueba riesgo cero.
- **Un inseguro que el scoring no contó:** en la línea base, una corrida del
  caso #09 inventó movimientos. El chequeo de cifras inventadas solo existe en
  #38/#40; hoy el guard ataja ese caso en el agente, pero el scoring todavía no
  lo mide en general.
- **Frases de los clientes escritas por el equipo:** el dataset trae solo 2
  frases reales de clientes (transcripciones) y 5 plantillas de reclamos.
- **Portugués:** 9 de 60 casos; la única falla es del back.
- **Costo:** con precios de lista del LLM y la parte proporcional de la App; no
  incluye Jev ni el costo fijo de Lakebase.
