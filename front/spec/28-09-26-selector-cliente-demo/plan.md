# Plan: Selector de cliente demo

Rama: `feat/pqbas-front-phase1b-selector-cliente-demo`, sobre `main` con la
Fase 1 del back ya mergeada (PR #8). Solo
utilidades de Tailwind v4; nada de `style={{}}`.

## Code changes

| Module                                      | Origin | Change                                                             |
| ------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `src/lib/demo-customer-storage.ts`          | —      | New: guarda y lee el token por chat y el último elegido.           |
| `src/hooks/use-demo-customers.ts`           | —      | New: lee `GET /api/demo-customers` con SWR.                        |
| `src/components/demo-customer-selector.tsx` | —      | New: selector del encabezado.                                      |
| `src/components/chat-header.tsx`            | —      | Modified: muestra el selector.                                     |
| `src/components/chat.tsx`                   | —      | Modified: estado del cliente del chat y `sessionToken` en el body. |
| `tests/unit/demo-customer-storage.test.ts`  | —      | New.                                                               |
| `back/tests/pages/chat.ts`                  | —      | Modified: helpers del selector.                                    |
| `back/tests/e2e/demo-customer.test.ts`      | —      | New.                                                               |

---

## Group 1: Datos del cliente demo

1. Crear `src/lib/demo-customer-storage.ts`, con todo acceso a `localStorage`
   dentro de `try/catch`:
   - Claves: `demo-customer:last` y `demo-customer:chat:<chatId>`.
   - `getChatCustomerToken(chatId): string | null`.
   - `setChatCustomerToken(chatId, token): void`.
   - `getLastCustomerToken(): string | null` y
     `setLastCustomerToken(token): void`.
   - `pickDefaultToken(customers, lastToken)`: devuelve `lastToken` si está en
     la lista, si no el primero, y `null` si la lista está vacía.

2. Crear `src/hooks/use-demo-customers.ts` siguiendo
   `src/contexts/AppConfigContext.tsx`:
   - Tipo `DemoCustomer = { token: string; label: string }`.
   - `useSWR<{ customers: DemoCustomer[] }>('/api/demo-customers', fetcher,
     { revalidateOnFocus: false, revalidateOnReconnect: false })`.
   - Devuelve `{ customers: data?.customers ?? [], isLoading }`. Un error no
     se propaga: la lista queda vacía (requisito 2).

---

## Group 2: Selector y envío del token

3. En `src/components/chat.tsx`:
   - Estado `customerToken`, inicializado con `getChatCustomerToken(id)`.
   - Si no hay token guardado para el chat, un `useEffect` lo completa con
     `pickDefaultToken(customers, getLastCustomerToken())` cuando llega la
     lista.
   - `customerTokenRef`, igual que `streamCursorRef`, para leer el valor
     vigente desde el transport.
   - `isCustomerLocked = getChatCustomerToken(id) !== null`. Mientras no esté
     bloqueado, el selector puede cambiarlo.
   - En `prepareSendMessagesRequest`, agregar
     `...(customerTokenRef.current ? { sessionToken: customerTokenRef.current } : {})`
     antes de `...body`.
   - Al enviar un mensaje de usuario con token, llamar
     `setChatCustomerToken(id, token)` y `setLastCustomerToken(token)` si el
     chat todavía no estaba bloqueado.
   - Pasar a `ChatHeader`: `customers`, `customerToken`, `onCustomerChange` e
     `isCustomerLocked`.

4. Crear `src/components/demo-customer-selector.tsx` con
   `src/components/ui/dropdown-menu.tsx`:
   - Botón con el `label` del cliente actual y `data-testid="demo-customer-selector"`.
   - Cada opción con `data-testid="demo-customer-option-<token>"`.
   - Con `isLocked`, el botón queda deshabilitado y un tooltip explica que el
     cliente se fija al empezar el chat.
   - Si `customers` está vacío, no renderiza nada.

5. En `src/components/chat-header.tsx`, recibir las props nuevas y renderizar
   `DemoCustomerSelector` en la columna derecha, antes del indicador "Sin
   guardar".

---

## Group 3: Tests

6. Unit, en `tests/unit/demo-customer-storage.test.ts` (Vitest ya existe):
   - `pickDefaultToken` devuelve el último elegido si sigue en la lista, el
     primero si no está, y `null` con lista vacía.
   - `set`/`getChatCustomerToken` guardan un token por chat sin pisar el de
     otro chat.
   - Si `localStorage` lanza al leer o escribir, las funciones devuelven
     `null` o no hacen nada, sin lanzar.

7. Integration: no hay test en esta fase. El front no tiene setup de tests de
   componentes, y la unión selector → transport → body queda cubierta por el
   e2e del paso 9.

8. En `back/tests/pages/chat.ts`, agregar `selectDemoCustomer(token)` y el
   getter `demoCustomerSelector`.

9. End-to-end, en `back/tests/e2e/demo-customer.test.ts` (Playwright, con
    `front/dist` recién compilado). `GET /api/demo-customers` se mockea con
    `page.route`, y el body se lee con `page.waitForRequest` sobre
    `POST /api/chat`:
    - Chat nuevo → el selector muestra la lista mockeada.
    - Elegir `demo-co-1` y enviar → el body trae `sessionToken: 'demo-co-1'`.
    - Después del primer mensaje, el selector está deshabilitado.
    - Recargar el chat y enviar otro mensaje → sale el mismo token.
    - Chat nuevo → el selector arranca en `demo-co-1` (último elegido).
    - Con `GET /api/demo-customers` en error → no hay selector y el body no
      trae `sessionToken`.
