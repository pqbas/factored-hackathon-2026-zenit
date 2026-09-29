# Requirements: Datos del cliente en el panel Contexto

El panel "Contexto del cliente" pasa a empezar con los datos principales del cliente, tal como están en el banco: una sección "Datos del cliente" en formato ficha (etiqueta: valor), arriba de "Caso derivado por David". Los datos vienen del bloque nuevo `profile` de `GET /api/advisor/conversations/:id/customer-context` (back, w1:p1, lee `bank_gold.customer_360` y `get_products`). El resto del panel y del contrato no cambia.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. El panel sigue con "Caso derivado por David" (si hay handoff) y las pestañas Casos, Interacciones y Transcripciones, en ese orden y con el mismo contenido.
2. El nombre y el id enmascarado del cliente siguen solo en el encabezado del chat.
3. Sin cliente del banco (204) o con error del banco (502), el panel se comporta igual que hoy.

And it changes in these ways:

4. La primera sección del panel es "Datos del cliente", una ficha con estos datos, en este orden, cada uno solo si viene:
   - Ubicación: ciudad y país.
   - Segmento.
   - Estado del cliente, traducido 1 a 1 (Active → Activo).
   - Cliente desde: la fecha de alta.
   - Productos: los activos, uno por línea ("Tarjeta Crédito ••1070").
   - Email.
   - Celular.
   - Canal preferido, traducido como los canales de Interacciones (Phone → Teléfono).
5. Los valores se muestran tal cual vienen del banco; solo se traducen las etiquetas y los enums conocidos. Un valor desconocido se muestra como viene.
6. Si `profile` es null o no trae ningún dato, la sección no se muestra.

## 2. Decisions

- El id de cliente no se repite en la ficha, porque ya está enmascarado en el encabezado del chat ("Cliente •• XXXX"). Así se cumple la regla de que cada dato aparezca una sola vez en el panel.
- Ciudad y país van en una sola fila ("Tijuana, México"), porque son un solo dato para el asesor y así la ficha es más corta.
- La ficha usa el mismo estilo que la de "Caso derivado por David" (`dl` en grilla etiqueta: valor), para que el panel se lea parejo. No se pliega: es corta y es lo primero que el asesor necesita.
- La fecha de alta se muestra como día ("3 jul 2022"), con el mismo formato que el resto del panel (`formatContextDate`).
- Los datos personales (email, celular) se muestran completos, porque el asesor los necesita para atender y el endpoint ya es solo para asesor y admin. Si el back los enmascara, se muestran como vengan.
- Esta fase depende del panel de la Phase 21 (la tarjeta del caso ya vive en el panel). Se construye sobre la rama de la Phase 21 (`feat/pqbas-front-filtros-handoff`) o, si esa ya está en main, desde main. Se hace ship después de que el back esté en main.
- Contrato (w1:p1, en revisión de w1:p4): `profile: { customerId, country, city, segment, status, customerSince, products: [{ productType, last4 }], contact: { email, mobilePhone }, preferredChannel }`. Cualquier campo puede venir null y `products` puede venir []. Si cambia algún nombre, se ajusta solo `parseCustomerContext`.

## 3. Context

- `spec/roadmap.md`: nueva Phase 22, "Datos del cliente en el panel Contexto".
- Contrato: mensaje de w1:p1 del 29/09 (bloque `profile`).
- Existing patterns:
  - `src/lib/customer-context.ts` (`parseCustomerContext`, `channelLabel`, `formatContextDate`, traducciones 1 a 1);
  - `src/components/conversations/customer-context-panel.tsx` (secciones del panel, `Field`);
  - `src/components/conversations/handoff-card.tsx` (estilo de la ficha).
