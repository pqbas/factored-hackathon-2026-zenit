# Validation: Selector de cliente demo

La fase está lista para mergear cuando se cumple todo lo siguiente.

## Automated Tests

- [x] `npm run build` en `front/` termina sin errores de tipos ni de build.
- [x] `npm test` en `front/` termina con exit code 0.
- [x] En `back/`, con `front/dist` recién compilado (el back lo sirve en
      producción):
      `FRONT_URL=http://localhost:3100 PORT=3100 NODE_ENV=production TEST_MODE=ephemeral PLAYWRIGHT=True npx playwright test tests/e2e/demo-customer.test.ts tests/e2e/conversations.test.ts --project=e2e`
      termina con exit code 0.
- [x] `grep -rn "style={{" front/src/components/demo-customer-selector.tsx`
      no devuelve nada.

### Specific test coverage required

#### Unit

- [x] `pickDefaultToken` devuelve el último elegido si sigue en la lista.
- [x] `pickDefaultToken` devuelve el primero si el último no está en la lista.
- [x] `pickDefaultToken` devuelve `null` con lista vacía.
- [x] El token guardado para un chat no pisa el de otro chat.
- [x] Si `localStorage` lanza, las funciones de guardado no lanzan.

#### Integration

No aplica en esta fase: el front no tiene setup de tests de componentes y el
e2e cubre la unión entre las piezas.

#### End-to-end

- [x] El selector de un chat nuevo lista los clientes de
      `GET /api/demo-customers`.
- [x] Enviar un mensaje con `demo-co-1` elegido manda
      `sessionToken: 'demo-co-1'` en el body de `POST /api/chat`.
- [x] El selector queda deshabilitado después del primer mensaje.
- [ ] Recargar el chat y enviar otro mensaje manda el mismo token. (Existe
      en el e2e pero se salta en modo efímero: necesita base de datos.)
- [x] Un chat nuevo arranca con el último cliente elegido.
- [x] Si `GET /api/demo-customers` falla, no hay selector y el body no trae
      `sessionToken`.

## Manual Checks

Pendientes para el usuario contra el agente real: al validar la fase, los
servidores y el agente no estaban corriendo.

Con el back de `main`, el agente y el front corriendo en local:

- [ ] Abrir `/`, ver el selector en el encabezado con los cinco clientes demo.
- [ ] Elegir "Santiago · México", preguntar "¿cuál es mi saldo?" y recibir
      una respuesta del agente para ese cliente.
- [ ] En ese mismo chat, confirmar que el selector no deja cambiar de cliente.
- [ ] Abrir un chat nuevo, elegir "Sesión vencida", enviar un mensaje y ver la
      respuesta de "inicia sesión" del agente, sin mensaje extra de la UI.
- [ ] Volver al primer chat desde la barra lateral y confirmar que sigue
      respondiendo como Santiago.
- [ ] Con `GET /api/demo-customers` devolviendo error (por ejemplo, back sin
      la Fase 1), confirmar que el selector no aparece y el chat sigue
      funcionando.
- [ ] En DevTools, confirmar que el body de `POST /api/chat` trae
      `sessionToken`.

## Definition of Done

Todas las casillas marcadas, la rama se rebasea sobre `main` sin conflictos y
no quedan `console.log` de depuración ni TODOs nuevos.
