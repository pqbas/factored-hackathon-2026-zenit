# Presentación del hackathon — asistente bancario con modelo experimental de fraude

Presentación de exactamente cinco diapositivas. Audiencia: jueces técnicos y
stakeholders de negocio. Duración aproximada: cinco minutos. El contenido de las
diapositivas y las notas del presentador están en español.

Hechos verificados contra: `ml/reports/2026-10-05/executable_predictions_report.md`,
`ml/reports/2026-10-05/aws_predictions_report.md` y
`ml/reports/2026-10-05/web_end_to_end_report.md`.

---

## Diapositiva 1 — Problema y solución propuesta

**Título:** Reclamos por cargos desconocidos: evidencia conectada y derivación estructurada

**Mensaje principal:** Los reclamos por cargos no reconocidos llegan con información
desconectada. El asistente reúne evidencia verificada y deriva un caso estructurado
al asesor humano, sin decisiones automáticas.

**Viñetas (máx. 4):**
- El cliente reporta un cargo que no reconoce; los datos del banco están dispersos.
- El asistente consulta datos autorizados y verifica el cargo antes de derivar.
- El caso llega al asesor con evidencia verificada y una señal experimental.
- El asesor humano decide; no se automatiza ninguna decisión financiera.

**Visual sugerido:** diagrama simple `Cliente → Asistente → Asesor`, con la evidencia
como entregable intermedio.

**Notas del presentador (≈50 s):**
> "Nuestro problema es muy concreto: cuando un cliente reclama un cargo que no
> reconoce, la información relevante está repartida en varios sistemas y el agente
> tiene que reconstruirla a mano. Lo que proponemos es un asistente que, en el
> mismo flujo de atención, consulta datos autorizados del banco, verifica que el
> cargo pertenece al cliente y deriva un caso ya estructurado al asesor. Es
> importante ser honestos: no vamos a reclamar una reducción medida de costos ni
> de tiempo de atención, porque no la medimos. Lo que sí entregamos es un flujo
> completo, desplegado y verificado, donde el asesor recibe mejor contexto para
> decidir."

**Evidencia citada:** `aws_predictions_report.md` y `web_end_to_end_report.md`.

---

## Diapositiva 2 — Datos y modelado responsable

**Título:** Datos y modelado responsable

**Mensaje principal:** Entender el desbalance extremo y evitar la fuga de
información es tan importante como entrenar el modelo.

**Viñetas (máx. 4):**
- 4,425,008 transacciones y solo 4,316 etiquetas de fraude (≈0.0975%).
- Se excluyeron campos con posible fuga de información (p. ej., `fraud_score` de procedencia desconocida).
- `amount_usd` crudo tenía 57.3% de valores faltantes; la normalización a USD lo redujo a ≈2.25%.
- Validación temporal estricta; el conjunto de test final permanece sin abrir.

**Visual sugerido:** gráfico de barras del desbalance (fraude vs. no fraude) y una
tabla corta con prevalencia y valores faltantes antes/después.

**Notas del presentador (≈50 s):**
> "Los datos nos enseñaron dos cosas antes de tocar ningún modelo. Primero, el
> desbalance es severo: poco menos de una de cada mil transacciones es fraude, así
> que predecir 'no fraude' acierta el 99.9% de las veces sin aportar nada. Segundo,
> hay que cuidar la fuga de información: detectamos un campo, `fraud_score`, con
> una asociación muy fuerte con la etiqueta, pero sin procedencia clara, así que lo
> excluimos por precaución. También tuvimos que normalizar los montos: el campo
> crudo en dólares faltaba en el 57.3% de los casos, y una normalización por moneda
> lo bajó a alrededor del 2.25%. Todo esto lo evaluamos en periodos separados en el
> tiempo, sin abrir el test final."

**Evidencia citada:** `profile_report.md` (2026-09-28) y `features_report.md`.

---

## Diapositiva 3 — Arquitectura realmente desplegada

**Título:** Arquitectura desplegada en AWS

**Mensaje principal:** El LLM solo conversa; el modelo predictivo es un CatBoost
nativo, separado, que corre sobre lecturas autorizadas.

**Viñetas (máx. 4):**
- Cliente web → backend/agente AWS existentes → lecturas autorizadas en Lakebase.
- Cálculo de features causales → CatBoost nativo V7 → handoff persistido → ficha del asesor.
- La identidad del cliente se toma de la sesión autenticada, nunca de argumentos del LLM.
- Permisos y política de revisión humana aplicados en código (no solo en texto).

**Visual sugerido:** el diagrama de flujo de `executable_predictions.md`:
`Asistente → consulta autorizada → features point-in-time → CatBoost → score y umbral → flujo del asesor`.

**Notas del presentador (≈50 s):**
> "Aquí hay un punto que queremos dejar muy claro: el modelo de lenguaje y el modelo
> predictivo son cosas distintas. El LLM se encarga de conversar y de recopilar el
> caso; la predicción la hace un CatBoost nativo, desplegado dentro del agente ya
> existente. El flujo es: la interfaz web llama al backend, que consulta las tablas
> autorizadas de Lakebase, calcula las features causales usando solo la historia
> anterior a la transacción, y el modelo devuelve un score experimental que se
> persiste en el handoff y se muestra al asesor. Dos decisiones de diseño son
> críticas: la identidad del cliente se liga a la sesión autenticada —no dejamos que
> el LLM la invente—, y la política de revisión humana está aplicada en código."

**Evidencia citada:** `manifest.json`, `agent/src/tools/transaction_risk.py`,
`agent/src/ml/predictor.py`.

---

## Diapositiva 4 — Demostración y resultados medidos

**Título:** Demostración y resultados medidos

**Mensaje principal:** La integración está verificada de punta a punta; la calidad
predictiva sigue siendo débil, y lo reportamos sin ocultarlo.

**Pasos del flujo verificado:**
1. El cliente reporta y confirma un cargo.
2. El modelo genera un score experimental real.
3. El asesor abre el caso persistido y ve el resultado.

**Dos grupos de resultados (separados):**
- **Ingeniería:** integración desplegada, predicción persistida tras recargar, 841 tests en verde, cero errores de página.
- **Calidad predictiva:** precisión 0.083056%, recall 0.858369%, ROC-AUC 0.496829 (6 verdaderos positivos entre 7,224 alertas).

**Visual sugerido:** captura de la ficha del asesor (placeholder de la tarjeta) junto a
una tabla con las métricas de ingeniería y las métricas predictivas.

**Notas del presentador (≈55 s):**
> "La demostración es un flujo real, ya desplegado. En tres pasos: el cliente entra,
> reporta un cargo y lo confirma; el modelo calcula un score experimental con datos
> reales de esa transacción; y el asesor abre el caso y ve el índice, y este persiste
> incluso tras recargar la página. Ahora, separo dos cosas que suelen mezclarse. Por
> un lado, la ingeniería funcionó: la integración está desplegada, la predicción se
> persiste y tenemos 841 tests en verde. Por otro, la calidad predictiva es débil:
> la precisión es 0.083%, el recall 0.86% y el ROC-AUC 0.497. En la práctica, de
> 7,224 alertas solo 6 eran fraude real. Que la integración funcione no significa que
> el modelo sea confiable, y no lo vamos a disfrazar."

**Evidencia citada:** `executable_predictions_report.md`, `web_end_to_end_report.md`.

---

## Diapositiva 5 — Límites, próximos pasos y valor entregado

**Título:** Límites, próximos pasos y valor entregado

**Mensaje principal:** Hoy se entrega el flujo completo; las decisiones automáticas
de fraude siguen deshabilitadas hasta que la evidencia predictiva las respalde.

**Próximos pasos (priorizados):**
1. Verificar la procedencia de las etiquetas e identificar señales realmente informativas.
2. Validar la disponibilidad de las features en el momento de la decisión y la frescura de los datos.
3. Correr un experimento acotado con evaluación independiente antes de promover el modelo.
4. Completar la revisión de Git, el push autorizado y el PR.
5. Añadir monitoreo operativo y medición de latencia bajo carga representativa.

**Cierre textual:** "Entregamos y verificamos la integración completa; las decisiones
automáticas de fraude permanecen deshabilitadas hasta que la evidencia predictiva las respalde."

**Visual sugerido:** lista priorizada con viñetas y el cierre destacado.

**Notas del presentador (≈50 s):**
> "Para cerrar, ¿qué es usable hoy? El asistente, la consulta autorizada, el handoff
> estructurado y la inferencia experimental. ¿Qué falta? Primero, entender de dónde
> vienen las etiquetas y encontrar señales que de verdad discriminen. Segundo,
> confirmar que cada feature esté disponible antes de la autorización y que los datos
> estén frescos. Tercero, hacer un experimento acotado y evaluarlo de forma
> independiente antes de siquiera pensar en promover el modelo. Cuarto, terminar la
> entrega de código: revisión, push autorizado y PR. Y quinto, monitoreo operativo.
> El mensaje final es claro: entregamos y verificamos la integración completa, pero
> las decisiones automáticas siguen deshabilitadas. La revisión humana es obligatoria."

**Evidencia citada:** `promotion_status: EXPERIMENTAL_NOT_VALIDATED_FOR_AUTOMATIC_DECISIONS`
en `manifest.json`.
