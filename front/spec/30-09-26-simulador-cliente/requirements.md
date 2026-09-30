# Requirements: Simulador de cliente

Para la demo, la entrada donde un asesor o un admin chatea con David se nombra como lo que es: una herramienta de prueba que simula a un cliente, no una función del asesor. El selector de cliente demo explica que los clientes salen del dataset sintético del hackathon.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. La misma ruta (`/`, `/chat/:id`) y el mismo chat con David, para los tres roles.
2. El acceso por rol (`src/lib/roles.ts`, revisado):
   - Cliente: David y Mis productos; no ve Chats ni Métricas.
   - Asesor: David y Chats; no ve Métricas.
   - Admin: todas las secciones.
   - Sin rol: se trata como cliente.

   Lo cubre `back/tests/e2e/roles.test.ts`.

And it changes in these ways:

3. Para el asesor y el admin, la entrada del menú se llama "Simulador de cliente (demo)" y usa un ícono de matraz (herramienta de prueba), no el globo de chat.
4. Para el cliente, la entrada sigue siendo "David (asistente virtual)": es su chat real, no un simulador.
5. El selector de cliente demo explica de dónde salen los clientes:
   - la ayuda dice "Clientes del dataset sintético del hackathon: elige a cuál simular";
   - el menú abre con el título "Dataset sintético del hackathon".

## 2. Decisions

- El cliente no ve la etiqueta "Simulador", pero sí el selector. Un usuario con rol cliente (y cualquier usuario sin rol, como un evaluador) necesita elegir un cliente del dataset para que David tenga sus productos y movimientos: sin token de sesión no hay datos del banco. Por eso el selector se queda, con el texto del dataset, y solo el nombre de la entrada cambia por rol.
- Los roles no cambian: la matriz de `SECTION_ROLES` ya cumple lo pedido. Solo se revisa que siga cubierta por el e2e.
- "Cliente demo:" se mantiene en el chip; lo del dataset va en la ayuda y en el menú, para que el chip siga siendo corto.

## 3. Context

- `src/components/nav-rail.tsx` (`NAV_ITEMS`) y `src/components/demo-customer-selector.tsx` (`DEMO_CUSTOMER_HINT`).
- `back/tests/e2e/roles.test.ts` y `demo-customer.test.ts`.
