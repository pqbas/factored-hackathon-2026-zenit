# Validation: Consola del asesor estilo CRM, con datos mock

La fase está lista para mergear cuando se cumple todo lo siguiente.

## Automated Tests

- [ ] `npm run build` en `front/` termina sin errores de tipos ni de build.
- [ ] `npm test` en `front/` termina con exit code 0.
- [ ] En `back/`, con `front/dist` recién compilado:
      `PORT=3100 NODE_ENV=production TEST_MODE=ephemeral PLAYWRIGHT=True npx playwright test tests/e2e/conversations.test.ts --project=e2e`
      termina con exit code 0.
- [ ] `grep -rn "style={{" front/src/components/conversations` no devuelve nada.

### Specific test coverage required

#### Unit

- [ ] `maskPhone` deja país, área y últimos cuatro dígitos.
- [ ] `conversationStatus` da `resolved` si está cerrada y, si no, el estado
      según `handledBy`.
- [ ] `filterByStatus` con `waiting` deja solo las Sin atender; con `all`, todas.
- [ ] `countByStatus` cuenta cada estado.
- [ ] `MOCK_CONVERSATIONS` tiene cinco clientes, alguno `human_queue` y alguno
      con una imagen con `redactions`.

#### Integration

- [ ] Reducer: tomar una conversación Sin atender la deja En atención, y
      `countByStatus` baja en uno.
- [ ] Reducer: `send` con el asistente en ON no agrega mensajes; en OFF agrega
      uno `advisor`, y en una Sin atender la pasa a En atención.
- [ ] Reducer: `resolve` deja la conversación Resuelto, con el asistente en ON y
      un mensaje `system`.
- [ ] Reducer: `addTag` ignora vacíos y repetidos.

#### End-to-end

- [ ] Los seis tests actuales de `/conversations` siguen pasando (el de enviar,
      apagando antes el asistente).
- [ ] El filtro "Sin atender" deja solo las filas con ese estado.
- [ ] Apagar el asistente habilita el campo y cambia el chip a "En atención".
- [ ] "Resolver" cambia el chip a "Resuelto" y vuelve a deshabilitar el campo.
- [ ] La conversación de Daniela muestra el aviso de derivación y la nota de
      datos ocultos.
- [ ] Tocar una respuesta rápida pone su texto en el campo.
- [ ] "+ Etiqueta" agrega una etiqueta al encabezado.

## Manual Checks

Con `npm run dev` en `front/`, abrir `http://localhost:3000/conversations`:

- [ ] La pantalla se parece al artboard "E · Consola del asesor (chats)" en
      modo oscuro, y se lee bien en modo claro.
- [ ] Abrir Javier → encabezado con nombre completo, ID, teléfono enmascarado
      y canal; interruptor en ON, aviso de que el asistente responde y campo
      deshabilitado.
- [ ] Abrir Santiago (Sin atender) → aviso de derivación en el chat; al enviar
      un mensaje, el chip pasa a "En atención".
- [ ] Apagar el asistente → el aviso cambia a "Estás atendiendo…", el campo se
      habilita y se puede enviar; el mensaje sale a la derecha con "Tú".
- [ ] Abrir Daniela → se ve el comprobante con el código tapado y la nota
      "Ocultamos un código de seguridad".
- [ ] Adjuntar una imagen desde el disco → aparece como burbuja del asesor.
- [ ] Subir en un chat largo → aparece el botón para bajar; tocarlo lleva al
      final y el botón se va.
- [ ] Recargar → todo vuelve a los datos mock.

## Definition of Done

Todas las casillas marcadas, la rama se rebasea sobre `main` sin conflictos y
no quedan `console.log` de depuración, `style={{}}` ni TODOs nuevos.
