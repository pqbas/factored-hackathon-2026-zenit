# Evaluación de David: antes y después

> Medición offline, en local. El set dev son los 40 casos de §7, con los que se corrigió al agente: su "después" puede estar sobreajustado. El holdout se escribió aparte y el equipo del agente no lo vio: su "después" es la medición sin leakage.

| Métrica | Dev (40) antes | Dev (40) después | Holdout antes | Holdout después |
| --- | --- | --- | --- | --- |
| Corridas que pasan | 86/120 (71.7%) | 115/120 (95.8%) | 50/60 (83.3%) | 57/60 (95.0%) |
| Resolución automática segura | 58/120 (48.3%) | 81/120 (67.5%) | 35/60 (58.3%) | 39/60 (65.0%) |
| Containment | 90/120 (75.0%) | 84/120 (70.0%) | 45/60 (75.0%) | 42/60 (70.0%) |
| Transferencias correctas | 25/33 (75.8%) | 31/33 (93.9%) | 15/18 (83.3%) | 18/18 (100.0%) |
| Transferencias faltantes | 6/33 (18.2%) | 0/33 (0.0%) | 3/18 (16.7%) | 0/18 (0.0%) |
| Transferencias sobrantes | 0/87 (0.0%) | 0/87 (0.0%) | 0/42 (0.0%) | 0/42 (0.0%) |
| Hallazgos inseguros | 0 | 0 | 0 | 0 |
| Latencia p50 | 9.0 s | 5.3 s | 10.7 s | 5.2 s |
| Latencia p95 | 13.0 s | 9.3 s | 18.6 s | 7.0 s |
| Costo por caso intentado | USD 0.0068 | USD 0.0064 | USD 0.0058 | USD 0.0048 |
| Costo por caso resuelto solo | USD 0.0181 | USD 0.0129 | USD 0.0133 | USD 0.0109 |
| Mismo veredicto en todas las corridas | 36/40 (90.0%) | 39/40 (97.5%) | 19/20 (95.0%) | 20/20 (100.0%) |
| Guard de grounding: disparos | sin datos | 9/279 (3.2%) | sin datos | 0/126 (0.0%) |
| Guard: reintentos respaldados | sin datos | 9/9 (100.0%) | sin datos | 0/0 |
| Pasa en español | 65/93 (69.9%) | 90/93 (96.8%) | 32/39 (82.1%) | 39/39 (100.0%) |
| Pasa en portugués | 21/27 (77.8%) | 25/27 (92.6%) | 18/21 (85.7%) | 18/21 (85.7%) |
| Muestra | 40 casos × 3 corridas | 40 casos × 3 corridas | 20 casos × 3 corridas | 20 casos × 3 corridas |
| Prompt | 68747d24cacf | 0dc3ef694900 | 68747d24cacf | 0dc3ef694900 |
| Commit del back | 638d1f8b | 5f7a1f63 | baf4fbc7 | 5f7a1f63 |
