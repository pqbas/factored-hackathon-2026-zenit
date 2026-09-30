# Requirements: Avatares con color por cliente

En la consola, todos los avatares se ven grises. Pasa por dos motivos:

- El color se calcula con `chat.userId`. En prod, todos los chats de la evaluación los creó el mismo usuario de la app, así que todos reciben el mismo color.
- La paleta tiene 3 grises de 5 colores.

Esta fase calcula el color a partir del cliente del banco y cambia la paleta a colores sin grises.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. Un mismo cliente tiene siempre el mismo color, en cada carga y en cada vista.
2. Las iniciales siguen en blanco, con el mismo tamaño y la misma forma.

And it changes in these ways:

3. El color sale del cliente del banco: primero `customerId`, si no `customerKey`, y si no hay cliente, `userId`.
4. La fila de la lista y el encabezado del chat abierto usan la misma clave, así que el cliente se ve del mismo color en los dos lugares.
5. La paleta tiene 8 colores distintos, sin grises: rosa, naranja, ámbar, esmeralda, verde azulado, celeste, índigo y violeta. Son tonos suaves (degradado vertical, como hoy), con contraste suficiente para las iniciales en blanco.

## 2. Decisions

- `customerId` va primero porque, cuando existe, el back arma `customerKey` con ese mismo valor (`coalesce(customerId, userEmail, userId)`). Así la fila, que trae `customerKey`, y el encabezado, que trae los campos del chat, dan el mismo color.
- El hash pasa de sumar códigos de caracteres a djb2. Con la suma, ids parecidos como CUS000123 y CUS000132 dan el mismo color. djb2 los reparte mejor entre los 8.
- Los tonos van de 500 a 600, o de 600 a 700 en los colores claros (ámbar, esmeralda, verde azulado y celeste), para que el blanco se lea bien. Siguen el estilo Notion Mail: color apagado y sin saturar.
- El panel Contexto no tiene avatar, así que no cambia.

## 3. Context

- `src/lib/conversations.ts` (`AVATAR_COLORS`, `avatarColor`).
- `src/components/conversations/inbox-list.tsx:67` y `conversation-header.tsx:95`.
- `back/packages/db/src/queries.ts` (`CUSTOMER_KEY`).
