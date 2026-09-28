# Validation: Consola del asesor con datos reales

La fase está lista para mergear cuando se cumple todo lo siguiente y las rutas
de asesores del back están en `main`.

## Automated Tests

- [x] `npm run build` en `front/` sin errores.
- [x] `npm test` en `front/` con exit code 0.
- [x] En `back/`, con `front/dist` recién compilado:
      `FRONT_URL=http://localhost:3100 PORT=3100 NODE_ENV=production TEST_MODE=ephemeral PLAYWRIGHT=True npx playwright test tests/e2e --project=e2e`
      con exit code 0.
- [x] Sin `style={{` en `front/src/components/conversations`.

### Specific test coverage required

#### Unit
- [x] `statusOf` da Resuelto con `closedAt` y si no, según `handledBy`.
- [x] `canReply` solo con la conversación abierta y tomada por mí.
- [x] `inboxUrl` arma cada filtro y la página siguiente.
- [x] `mergeMessages` no duplica y respeta el orden.
- [x] `toBubble` pone "Tú", el email del otro asesor o "Asistente".

#### Integration
- [x] take con 409 devuelve quién la tiene; con `force` manda el flag.
- [x] reply y release llaman a sus rutas con el body del contrato.
- [x] Mensajes: `after` con 400 recarga completos.

#### End-to-end
- [x] Bandeja y filtros piden la API con los params del contrato.
- [x] Apagar el asistente toma la conversación y habilita el campo.
- [x] Responder agrega el mensaje del asesor.
- [x] Prender el asistente la devuelve; "Resolver" la cierra.
- [x] 409 al tomar muestra quién la tiene.
- [x] Tomada por otro: campo deshabilitado y aviso; un admin puede forzar.

## Manual Checks

Hecho con el back de `main` (PR #22) en :3200, `chatbot_dev`, el agente real,
`ADVISOR_EMAILS=asesor1,asesor2@example.com`, `ADMIN_EMAILS=pcubasm1@gmail.com`
y el front de las ramas 7 + 1c juntas:

- [x] asesor1 apaga a David y toma la conversación; asesor2 ve "La atiende
      asesor1@example.com", tiene el campo deshabilitado y la API le responde
      409 al tomar y al responder.
- [x] El admin la toma con "Tomar de todos modos" y responde; asesor1 pasa a
      ver "La atiende pcubasm1@gmail.com" y queda deshabilitado.
- [x] El cliente ve las respuestas en menos de 5 s.
- [x] Devolverla a David la deja "Con David"; retomarla y "Resolver" la deja
      "Resuelto" y aparece en el filtro Cerradas.

## Definition of Done
Todas las casillas marcadas y las rutas del back en `main`.
