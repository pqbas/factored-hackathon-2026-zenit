# Validation: El idioma elegido por el cliente llega al agente

- [x] `custom_inputs.language` es `es` o `pt` cuando el body lo trae, y no
      aparece si falta o es inválido
- [x] El reintento de la cola lleva el idioma del turno
- [x] `npm run test:with-db`, `npm run test:ephemeral`, `tsc`, `db:check` y el
      build del front en 0
