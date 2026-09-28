# Validation: Consola del asesor con datos reales

La fase está lista para mergear cuando se cumple todo lo siguiente y las rutas
de asesores del back están en `main`.

## Automated Tests

- [ ] `npm run build` en `front/` sin errores.
- [ ] `npm test` en `front/` con exit code 0.
- [ ] En `back/`, con `front/dist` recién compilado:
      `FRONT_URL=http://localhost:3100 PORT=3100 NODE_ENV=production TEST_MODE=ephemeral PLAYWRIGHT=True npx playwright test tests/e2e --project=e2e`
      con exit code 0.
- [ ] Sin `style={{` en `front/src/components/conversations`.

### Specific test coverage required

#### Unit
- [ ] `statusOf` da Resuelto con `closedAt` y si no, según `handledBy`.
- [ ] `canReply` solo con la conversación abierta y tomada por mí.
- [ ] `inboxUrl` arma cada filtro y la página siguiente.
- [ ] `mergeMessages` no duplica y respeta el orden.
- [ ] `toBubble` pone "Tú", el email del otro asesor o "Asistente".

#### Integration
- [ ] take con 409 devuelve quién la tiene; con `force` manda el flag.
- [ ] reply y release llaman a sus rutas con el body del contrato.
- [ ] Mensajes: `after` con 400 recarga completos.

#### End-to-end
- [ ] Bandeja y filtros piden la API con los params del contrato.
- [ ] Apagar el asistente toma la conversación y habilita el campo.
- [ ] Responder agrega el mensaje del asesor.
- [ ] Prender el asistente la devuelve; "Resolver" la cierra.
- [ ] 409 al tomar muestra quién la tiene.
- [ ] Tomada por otro: campo deshabilitado y aviso; un admin puede forzar.

## Manual Checks
- [ ] Con el back real: dos asesores en dos navegadores; el segundo no puede
      responder una conversación tomada por el primero.
- [ ] El cliente escribe y el mensaje aparece en la consola en menos de 5 s.

## Definition of Done
Todas las casillas marcadas y las rutas del back en `main`.
