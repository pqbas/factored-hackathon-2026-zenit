# Evaluación de David

Qué resuelve David, medido con casos de prueba contra el sistema completo (back,
agente, LLM y datos del banco). Las cifras detalladas, los reportes de cada
corrida y el registro de cambios a los casos están en
[`back/scripts/eval/results/comparacion.md`](../back/scripts/eval/results/comparacion.md).

> **Medición offline, en local** (29–30/09/2026). El back y el agente corren en
> local con el código de `main`; el LLM (Qwen 3 Next 80B) y los datos del banco
> (Lakebase `bank_ro`) son los mismos que usa prod. Todavía no hay una medición
> contra las Apps desplegadas.

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

## 3. Qué resuelve David, por caso de uso (después)

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

## 4. Clasificador de intención (componente aprendido vs. baseline)

39 mensajes etiquetados de los casos de práctica × 3 repeticiones.

| Clasificador | Exactitud | p50 | p95 | Nota |
| --- | --- | --- | --- | --- |
| Reglas de palabras clave (baseline) | 66.7% | ~0 s | ~0 s | |
| Jev | **92.3%** | **0.28 s** | **0.38 s** | No usable en prod: la App no tiene salida a internet |
| GPT-OSS 20B | 88.9% | 2.9 s | 4.6 s | 10% supera el timeout de 4 s |
| Llama 3.1 8B | 87.2% | 2.5 s | 4.7 s | 6% supera el timeout de 4 s |
| Gemma 3 12B | 0% | — | — | No devuelve la salida estructurada |
| Qwen 3 Next 80B (prod) | pendiente | | | |

## 5. Guard de grounding

Si David muestra datos de la cuenta sin haber llamado a la herramienta que los
devuelve, la respuesta se detiene y se reintenta una vez forzando la
herramienta; si falla, responde "Ahora no puedo consultar esa información.".
En la corrida "después" se disparó en 9 de 279 turnos (práctica) y 0 de 126
(examen); los 9 reintentos trajeron los datos reales.

## 6. Limitaciones

- **Offline y en local.** No es una medición de producción; falta correr el
  examen contra las Apps desplegadas.
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
