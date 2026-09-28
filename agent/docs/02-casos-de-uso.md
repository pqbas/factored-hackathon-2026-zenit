# 2. Casos de uso: volumen en los datos

De qué hablan los clientes cuando contactan al banco, según la categoría de los
686,296 contactos de `call_center_interactions`. Sirve para priorizar qué casos
de uso cubre el agente.

| Categoría                | Contactos   | % del total | Resuelto en el contacto | Escalado | Duración mediana | Caso de uso                                         |
| ------------------------ | ----------- | ----------- | ----------------------- | -------- | ---------------- | --------------------------------------------------- |
| Transaccional + Producto | 390,919     | 57.0%       | ~90%                    | ~10%     | 3.4–4.4 min      | [UC-01 Consultas generales](09-consultas-generales.md) |
| Queja                    | 117,021     | 17.1%       | 43.6%                   | 10.0%    | 7.2 min          | [UC-02 Quejas](10-quejas.md)                           |
| Técnico                  | 102,899     | 15.0%       | 69.9%                   | 10.1%    | 6.0 min          | Candidato                                           |
| Comercial                | 54,879      | 8.0%        | 65.2%                   | 9.8%     | 9.0 min          | Derivación directa a humano                         |
| Retención                | 20,578      | 3.0%        | 60.2%                   | 9.8%     | 8.0 min          | Derivación directa a humano                         |
| **Total**                | **686,296** | **100%**    |                         |          |                  |                                                     |

Detalle de Transaccional + Producto:

| Categoría     | Contactos | % del total | Resuelto en el contacto | Escalado | Duración mediana |
| ------------- | --------- | ----------- | ----------------------- | -------- | ---------------- |
| Transaccional | 240,056   | 35.0%       | 91.5%                   | 9.9%     | 3.4 min          |
| Producto      | 150,863   | 22.0%       | 89.6%                   | 10.0%    | 4.4 min          |

## 2.1 Técnico

Es el tercer caso por volumen, pero los datos no dicen qué falla: no hay
subcategoría y las transcripciones repiten la plantilla de consulta de saldo. La
señal más cercana son los eventos `Error` de `digital_events` (179,388 en
Transaction y 179,335 en Navigation). Se cruza con la queja "Problema con app",
así que falta decidir si se tratan juntos o por separado.

## 2.2 Limitaciones de los datos

- `reason_category` y `contact_reason` tienen los mismos valores, así que no hay
  un nivel más fino que la categoría.
- El volumen de UC-01 es una cota superior: Transaccional también incluye
  contactos que no son consultas.
- Las transcripciones son plantillas y solo cubren cerca del 25% de los
  contactos.
