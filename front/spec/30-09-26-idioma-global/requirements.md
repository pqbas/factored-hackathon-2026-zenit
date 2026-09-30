# Requirements: Idioma global de la app

El idioma deja de ser un ajuste del chat y pasa a ser un ajuste de toda la app. Se elige con un botón visible en la barra de íconos, abajo, apilado arriba del botón de tema y del avatar. Aplica a todas las pantallas.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. La clave `ui:lang`, el idioma por defecto (país del cliente demo, después el navegador, después ES) y el envío de `language` en cada `POST /api/chat`.
2. El chat del cliente, ya traducido en la fase 28.

And it changes in these ways:

3. El selector sale del header del chat. En la barra de íconos, arriba del botón de tema, hay un botón del mismo tamaño y estilo que muestra "ES" o "PT". Con un clic alterna el idioma. Su tooltip dice "Idioma: Español" o "Idioma: Português".
4. Con Português, se muestran en portugués:
   - la navegación lateral (nombres y tooltips);
   - la consola del asesor:
     - vistas, motivos y estados;
     - el selector Bandeja / Agente AI y los contadores;
     - las secciones y los estados vacíos;
     - el header del chat del asesor y el placeholder del compositor;
     - las acciones (tomar, devolver, resolver) y el panel Contexto (datos del cliente, caso derivado, casos, interacciones, transcripciones);
     - los errores;
   - Métricas: títulos, KPIs, gráficos, rangos y errores;
   - Mis productos: títulos, estados vacíos y errores;
   - la pantalla de sin acceso.
5. Los datos no se traducen:
   - los nombres de clientes y comercios;
   - los motivos y textos del dataset;
   - los mensajes y resúmenes que escribieron David o los asesores.
6. Cambiar de idioma actualiza toda la pantalla al instante.

## 2. Decisions

- La barra de íconos es la ubicación que eligió el usuario, con una captura: el idioma queda siempre visible, igual que el tema. Primero se había pedido el menú del avatar; el usuario lo corrigió.
- La capa de i18n es la misma de la fase 28: un diccionario `es`/`pt` en `src/lib/i18n.ts`. Para el código fuera de React (los helpers de `lib` que devuelven etiquetas, como `sectionLabel` y `STATUS_LABEL`) hay un idioma global (`tr()`), que `LangProvider` fija antes de renderizar.
- Un cambio de idioma remonta la app (`key={lang}`), para que también se relean las etiquetas calculadas fuera de React y las de los componentes memoizados. Se pierde el estado efímero de la pantalla (un chat abierto en la consola, un texto a medio escribir). Se acepta, porque cambiar de idioma es poco frecuente.
- Los tests unitarios siguen en español: el idioma global arranca en `es`.
- Las fechas relativas y los formatos (date-fns) usan el locale del idioma elegido (`es` o `pt-BR`).

## 3. Context

- Pedido de w1:p4 (30/09). La ubicación en el menú del avatar la eligió el usuario.
- Fase 28: `spec/30-09-26-idioma-es-pt/`.
