# Plan: Los tests no agotan la memoria ni dejan procesos colgados

1. `playwright.config.ts`:
   - `workers: Number(process.env.PW_WORKERS) || 2`;
   - `reporter: [['html', { open: 'never' }]]`;
   - `reapOrphanBrowsers()` en el proceso principal.
2. `tests/reap-orphan-browsers.ts`: `ps -eo pid,ppid,args` y SIGKILL a los
   procesos de `ms-playwright` con padre 1.
3. `scripts/playwright-test.sh`: grupo de procesos propio (`set -m`), y SIGINT
   y después SIGTERM al grupo al salir. `package.json` lo usa en `test:with-db`
   y `test:ephemeral`.
