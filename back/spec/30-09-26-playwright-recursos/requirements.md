# Requirements: Los tests no agotan la memoria ni dejan procesos colgados

La laptop del usuario se reinició por falta de memoria: el log mostraba 59
`chrome-headless`. Los tests del back corrían con 8 workers, y varios
worktrees corren la suite a la vez. Además, una corrida interrumpida podía
dejar navegadores y el webServer (`npm run dev` en `:3100`) huérfanos.

## 1. Functional requirements

1. Playwright corre con 2 workers por defecto (`PW_WORKERS` lo cambia).
2. Al empezar una corrida, se matan los navegadores de Playwright huérfanos de
   corridas anteriores: procesos de `ms-playwright` cuyo padre es el PID 1.
   Los navegadores de una corrida en curso no se tocan.
3. `test:with-db` y `test:ephemeral` corren Playwright por
   `scripts/playwright-test.sh`, que lo lanza en su propio grupo de procesos.
   Termine como termine (fin normal, Ctrl+C o SIGTERM), manda SIGINT al grupo
   para que Playwright cierre el webServer y los navegadores, y después de
   10 s manda SIGTERM.
4. El reporte html nunca se abre solo, porque dejaba un servidor corriendo
   después de una falla.

## 2. Decisions

- 2 workers: con 2, el pico fue de 14 a 16 procesos de Chrome, contra ~56
  antes (medido por w1:p6), y la suite with-db tarda 51 s.
- El reaper solo mira procesos re-parentados al PID 1, para no matar los
  navegadores de otro worktree que está corriendo tests.
- El wrapper sale de la propuesta de w1:p6: Playwright deja el webServer en su
  propio grupo y solo lo cierra con SIGINT.

## 3. Context

- `back/playwright.config.ts`, `back/package.json`.
