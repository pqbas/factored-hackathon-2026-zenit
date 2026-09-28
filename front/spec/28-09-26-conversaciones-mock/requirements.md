# Requirements: Vista de conversaciones estilo WhatsApp (mock)

La app queda con dos interfaces. La primera es el chat actual en `/`, donde se
conversa con el agente, y no cambia. La segunda es una pantalla nueva en
`/conversations`, con el aspecto de WhatsApp Web: a la izquierda la lista de
clientes y a la derecha la conversación del cliente elegido. En esta fase la
pantalla nueva usa solo datos mock (clientes y mensajes inventados en el
front) para ver cómo va a quedar la UI. No llama al back ni al agente, y no
cambia ningún contrato.

## 1. Functional requirements

Después de esta fase, la app debe seguir haciendo lo que hace hoy:

1. El chat en `/` y `/chat/:id` funciona igual: streaming, historial en la
   barra lateral, modo efímero.

Y cambia en estas cosas:

2. La app se organiza en tres columnas. La primera es un riel angosto de
   íconos, siempre visible, que cambia de sección: "Agente" (`/`) y "Chats"
   (`/conversations`), con la sección activa resaltada. La segunda y la
   tercera columna las pone cada sección: en Agente, el historial y el chat
   con el agente; en Chats, la lista de clientes y la conversación.
3. `/conversations` muestra dos paneles, como WhatsApp Web: la lista de
   clientes a la izquierda y la conversación a la derecha.
4. Cada fila de la lista es un cliente demo: avatar con iniciales, nombre, el
   último mensaje recortado a una línea, la hora del último mensaje y, si
   corresponde, un contador de no leídos.
5. La lista tiene un buscador que filtra los clientes por nombre.
6. Al hacer click en un cliente, el panel derecho muestra su conversación y la
   fila queda resaltada. El contador de no leídos de ese cliente desaparece.
7. La conversación se ve desde el lado del operador: los mensajes del cliente
   a la izquierda en burbujas claras, los del agente a la derecha en burbujas
   verdes. Cada burbuja muestra su hora, y las del agente muestran el doble
   check.
8. Los mensajes se agrupan por día con un separador ("Hoy", "Ayer" o la
   fecha).
9. El panel derecho tiene un encabezado con el avatar y el nombre del cliente,
   y abajo una caja de texto. Lo que se escribe y se envía aparece como burbuja
   del agente al final de la conversación, sin llamar al back ni al agente.
   Recargar la página vuelve a los mensajes mock originales.
10. Sin cliente elegido, el panel derecho muestra un estado vacío ("Elige una
    conversación").
11. En pantallas angostas (< 768 px) se ve un solo panel a la vez: la lista, o
    la conversación con un botón para volver a la lista.
12. La pantalla se ve bien en modo claro y oscuro.
13. La lista de Chats usa el mismo componente `Sidebar` que Agente (mismo
    ancho, encabezado, filas, pie con el usuario y botón para plegarla). En
    pantallas angostas se abre como panel deslizable, igual que en Agente.
14. En Agente, el historial muestra seis chats de ejemplo del lado del cliente
    del banco (saldo, beneficiario, aumento de límite, tarjeta perdida, cargo
    no reconocido, sesión vencida), debajo de los chats reales. Al abrir uno
    se ve la conversación en el chat del agente y se puede seguir escribiendo.
15. El historial ya no muestra los filtros de etapa, intención y cliente, ni el
    aviso "Chat history is disabled".

## 2. Decisions

- La vista nueva vive en su propia ruta y no reemplaza al chat, porque son dos
  interfaces con usos distintos: una para hablar con el agente y otra para
  revisar conversaciones.
- El cambio de sección va en un riel de íconos (`src/components/nav-rail.tsx`,
  montado en `src/layouts/AppShell.tsx`) y no en botones dentro de cada
  pantalla, porque así cada sección define su propia segunda y tercera columna
  y sumar una sección nueva es agregar una entrada al riel. La barra lateral
  del chat se corre `md:left-16` para quedar a la derecha del riel, porque el
  componente `Sidebar` es `position: fixed`.
- Los datos mock viven en un archivo del front (`src/mocks/conversations.ts`)
  y no en un endpoint, porque esta fase solo sirve para validar la UI. Cuando
  exista el endpoint de conversaciones, se reemplaza la fuente de datos y los
  componentes quedan.
- Los clientes mock son los cinco clientes demo del agente (Santiago · México,
  Javier · Colombia, Daniela · Argentina, Cliente cerrado, Sesión vencida),
  para que la vista ya hable de los mismos clientes que se van a usar después.
- La vista es del lado del operador (cliente a la izquierda, agente a la
  derecha), porque es la base de la futura vista de admin y asesor.
- `/conversations` no exige sesión de Databricks, porque no toca datos reales
  y así se puede revisar la UI con el back caído. Cuando la vista use datos
  reales, entra detrás de la sesión y del rol (fase de roles).
- El estilo copia la disposición de WhatsApp Web (dos paneles, burbujas,
  separadores de día, fondo del chat) usando los colores del tema de la app
  más un verde para las burbujas del agente, sin copiar logos ni marcas.
- El selector de cliente demo en el encabezado del chat se sacó de esta rama
  (revert de `2d1ae54` y `1a84361`), porque la lista de clientes de la vista
  nueva cumple ese papel. Conectar el token del cliente al chat real queda para
  cuando el back mergee su Fase 1.
- Vitest ya quedó configurado en el front (`2a627d5`) y se usa para los tests
  unitarios de esta fase.

## 3. Context

- `spec/roadmap.md`: Phase 1, Vista de conversaciones estilo WhatsApp (mock).
- `agent/src/db/session_repo.py`: los cinco clientes demo.
- Patrones existentes:
  - `src/App.tsx`: rutas; `RootLayout` y `ChatLayout`.
  - `src/components/app-sidebar.tsx`: barra lateral del chat, donde va el
    acceso a "Conversaciones".
  - `src/components/ui/input.tsx`, `button.tsx`, `lucide-react`: piezas de UI
    e íconos.
  - `src/index.css`: variables de color del tema claro y oscuro.
  - `src/hooks/use-mobile.tsx`: detección de pantalla angosta.
