# Validation: El examen contra producción

- [ ] Unit: el guard rechaza una App sin `--allow-prod`, la acepta con el flag
      y sigue rechazando hosts que no son Databricks Apps
- [ ] `npx tsc --noEmit` en 0
- [ ] Las dos Apps quedan RUNNING, y un chat de saldo funciona en prod
- [ ] El holdout 20×3 corre contra prod y escribe
      `<fecha>-holdout-llm-prod.json`/`.md`
- [ ] La comparación con el holdout "después" local está en el resumen
