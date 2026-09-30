# Plan: El examen contra producción

1. `scripts/eval/guard.ts`: `assertLocalBase(base, allowProd)`.
2. `scripts/eval/args.ts`: `--allow-prod`.
3. `scripts/eval/run.ts`: token de la CLI contra una App desplegada, rechazo
   de pasos de asesor, y `chatId` en cada corrida.
4. `scripts/eval/cleanup.ts` y `npm run eval:cleanup`.
5. `agent/app.yaml` y `back/app.yaml`: tokens demo.
6. Tests unit en `tests/ai-sdk-provider/eval-score.test.ts`: el guard con y
   sin `--allow-prod`.
7. Deploy del agente y después del back desde main; holdout 20×3 contra prod
   con `--label prod`; `eval:compare` contra el holdout "después" local.
