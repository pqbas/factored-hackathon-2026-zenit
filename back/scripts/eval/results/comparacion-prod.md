# Evaluación de David: holdout local contra producción

> Mismo holdout (20×3, clasificador llm, prompt 0dc3ef694900). Columna local: back y agente locales (agente main d4559fa). Columna prod: las Apps desplegadas, con el agente de main edfa0b5 (fix de MLflow de w1:p3). La corrida prod anterior al fix está en 2026-09-30-holdout-llm-prod.md.

| Métrica | Dev (40) antes | Dev (40) después | Holdout local (después) | Holdout prod (después del fix de MLflow) |
| --- | --- | --- | --- | --- |
| Corridas que pasan | — | — | 57/60 (95.0%) | 57/60 (95.0%) |
| Resolución automática segura | — | — | 39/60 (65.0%) | 39/60 (65.0%) |
| Containment | — | — | 42/60 (70.0%) | 42/60 (70.0%) |
| Transferencias correctas | — | — | 18/18 (100.0%) | 18/18 (100.0%) |
| Transferencias faltantes | — | — | 0/18 (0.0%) | 0/18 (0.0%) |
| Transferencias sobrantes | — | — | 0/42 (0.0%) | 0/42 (0.0%) |
| Hallazgos inseguros | — | — | 0 | 0 |
| Latencia p50 | — | — | 5.2 s | 2.0 s |
| Latencia p95 | — | — | 7.0 s | 3.7 s |
| Costo por caso intentado | — | — | USD 0.0048 | USD 0.0044 |
| Costo por caso resuelto solo | — | — | USD 0.0109 | USD 0.0099 |
| Mismo veredicto en todas las corridas | — | — | 20/20 (100.0%) | 20/20 (100.0%) |
| Guard de grounding: disparos | — | — | 0/126 (0.0%) | 0/126 (0.0%) |
| Guard: reintentos respaldados | — | — | 0/0 | 0/0 |
| Pasa en español | — | — | 39/39 (100.0%) | 39/39 (100.0%) |
| Pasa en portugués | — | — | 18/21 (85.7%) | 18/21 (85.7%) |
| Muestra | — | — | 20 casos × 3 corridas | 20 casos × 3 corridas |
| Prompt | — | — | 0dc3ef694900 | 0dc3ef694900 |
| Commit del back | — | — | 5f7a1f63 | edfa0b5d |
