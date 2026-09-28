# Validation: Vista de conversaciones estilo WhatsApp (mock)

La fase está lista para mergear cuando se cumple todo lo siguiente.

## Automated Tests

- [ ] `npm run build` en `front/` termina sin errores de tipos ni de build.
- [ ] `npm test` en `front/` termina con exit code 0.
- [ ] `npx playwright test tests/e2e/conversations.test.ts` en `back/`, con
      `TEST_MODE=ephemeral` y `front/dist` recién compilado, termina con exit
      code 0.

### Specific test coverage required

#### Unit

- [ ] `getInitials` devuelve dos letras para nombres de una y de varias
      palabras.
- [ ] `filterConversations` ignora mayúsculas y tildes.
- [ ] `sortByLastMessage` pone primero el cliente con el mensaje más reciente.
- [ ] `groupMessagesByDay` etiqueta "Hoy", "Ayer" y fechas anteriores.
- [ ] `formatListTime` devuelve hora, "Ayer" o fecha según el día.
- [ ] `MOCK_CONVERSATIONS` tiene cinco clientes con mensajes, y alguno de hoy.

#### Integration

No aplica en esta fase: el front no tiene setup de tests de componentes y el
e2e cubre la unión entre las piezas.

#### End-to-end

- [ ] `/conversations` muestra cinco filas.
- [ ] Buscar "dan" deja solo a Daniela.
- [ ] Elegir un cliente muestra burbujas de cliente y de agente, y resalta la
      fila.
- [ ] Abrir un cliente con no leídos quita el contador.
- [ ] Enviar un mensaje agrega una burbuja de agente con ese texto.
- [ ] El riel cambia entre Agente y Chats y marca la sección activa.

## Manual Checks

Con `npm run dev` en `front/`:

- [ ] Abrir `http://localhost:3000/conversations` → lista a la izquierda y
      "Elige una conversación" a la derecha.
- [ ] Elegir Santiago → burbujas del cliente a la izquierda y del agente a la
      derecha en verde, con hora y doble check, y separadores "Hoy" y "Ayer".
- [ ] Escribir un mensaje y apretar Enter → aparece al final y la vista baja
      sola hasta él.
- [ ] Recargar la página → el mensaje escrito desaparece y vuelven los mocks.
- [ ] Cambiar a modo oscuro → burbujas, fondo y lista se leen bien.
- [ ] Achicar la ventana a menos de 768 px → se ve solo la lista; al elegir un
      cliente se ve solo la conversación, y la flecha vuelve a la lista.
- [ ] Con el back corriendo, el riel de la izquierda pasa de Agente (historial
      + chat) a Chats (lista + conversación) y de vuelta, y la barra lateral
      del chat no queda tapada por el riel.

## Definition of Done

Todas las casillas marcadas, la rama se rebasea sobre `main` sin conflictos y
no quedan `console.log` de depuración ni TODOs nuevos.
