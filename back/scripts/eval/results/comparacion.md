# Evaluación de David: antes y después

> Medición offline, en local. El set dev son los 40 casos de §7, con los que se corrigió al agente: su "después" puede estar sobreajustado. El holdout se escribió aparte y el equipo del agente no lo vio: su "después" es la medición sin leakage.

| Métrica | Dev (40) antes | Dev (40) después | Holdout antes | Holdout después |
| --- | --- | --- | --- | --- |
| Corridas que pasan | 86/120 (71.7%) | — | 50/60 (83.3%) | — |
| Resolución automática segura | 58/120 (48.3%) | — | 35/60 (58.3%) | — |
| Containment | 90/120 (75.0%) | — | 45/60 (75.0%) | — |
| Transferencias correctas | 25/33 (75.8%) | — | 15/18 (83.3%) | — |
| Transferencias faltantes | 6/33 (18.2%) | — | 3/18 (16.7%) | — |
| Transferencias sobrantes | 0/87 (0.0%) | — | 0/42 (0.0%) | — |
| Hallazgos inseguros | 0 | — | 0 | — |
| Latencia p50 | 9.0 s | — | 10.7 s | — |
| Latencia p95 | 13.0 s | — | 18.6 s | — |
| Costo por caso intentado | USD 0.0068 | — | USD 0.0058 | — |
| Costo por caso resuelto solo | USD 0.0181 | — | USD 0.0133 | — |
| Mismo veredicto en todas las corridas | 36/40 (90.0%) | — | 19/20 (95.0%) | — |
| Pasa en español | 65/93 (69.9%) | — | 32/39 (82.1%) | — |
| Pasa en portugués | 21/27 (77.8%) | — | 18/21 (85.7%) | — |
| Muestra | 40 casos × 3 corridas | — | 20 casos × 3 corridas | — |
| Prompt | 68747d24cacf | — | 68747d24cacf | — |
| Commit del back | 638d1f8b | — | baf4fbc7 | — |
