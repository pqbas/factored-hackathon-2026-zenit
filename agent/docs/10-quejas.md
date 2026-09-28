# 10. UC-02 Quejas: alcance

El agente no resuelve quejas: las **registra** y hace **seguimiento**. Cubre dos
consultas:

| Consulta                              | Respuesta del agente                                                                                                                                  | Datos                                                                                                 |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Registrar una queja**               | Clasifica la queja en una de las 5 subcategorías, toma los datos, crea el caso y entrega el número. Para "Cargo no reconocido" usa el flujo de disputa. | Escribe en `bank_ops`; usa las categorías de `complaints`                                             |
| **Consultar el estado** de sus quejas | Estado, prioridad, días abiertos y si se resolvió, de los casos del propio cliente.                                                                   | `bank_gold.customer_cases`: `status`, `is_open`, `priority`, `age_days`, `resolution`, `sla_breached` |

Las consultas filtran por el `customer_id` de la sesión.

## 10.1 Volumen

| Categoría en `call_center_interactions` | Contactos   | % del total |
| --------------------------------------- | ----------- | ----------- |
| **Queja**                               | **117,021** | **17.1%**   |
| Total de contactos                      | 686,296     | 100%        |

| Tipo de queja        | Contactos (estimado) | % del total de contactos | Qué hace el agente                           |
| -------------------- | -------------------- | ------------------------ | -------------------------------------------- |
| Cargo no reconocido  | 21,447               | 3.1%                     | Verifica el cargo en `transactions`.         |
| Cobro indebido       | 21,268               | 3.1%                     | Registra el reclamo y deriva.                |
| Problema con app     | 21,153               | 3.1%                     | Registra el reclamo y deriva.                |
| Atención en sucursal | 20,741               | 3.0%                     | Registra el reclamo y deriva.                |
| Calidad de servicio  | 20,730               | 3.0%                     | Registra el reclamo y deriva.                |
| Sin subcategoría     | 11,682               | 1.7%                     | Pregunta el motivo, registra y deriva.       |
| **Total Queja**      | **117,021**          | **17.1%**                |                                              |

Se usan dos tablas porque cada una aporta un dato distinto:

- `call_center_interactions` dice **cuántas veces** los clientes contactan por
  una queja (117,021), pero no de qué se quejan.
- `complaints` dice **de qué se quejan** (la subcategoría de 67,095 reclamos),
  pero no se vincula con los contactos: `origin_interaction_id` está siempre
  vacío.

Por eso el desglose es una estimación: aplica a los 117,021 contactos la
proporción de cada subcategoría en `complaints`.

## 10.2 Casos

### 10.2.1 Cargo no reconocido

| Campo                  | Detalle                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Qué es**             | El cliente ve en su cuenta o tarjeta un cargo que no hizo o no autorizó.                                                                                                                                             |
| **Ejemplo**            | "No reconozco un cargo de Uber de 45 pesos de ayer."                                                                                                                                                                 |
| **Qué hace el agente** | Busca el cargo en las transacciones del cliente, lo confirma con él y aplica la política de disputas: crea el caso `Open`, o `Escalated` si hay monto alto o señal de fraude. Es el flujo de UC-02, ya implementado. |
| **Datos**              | `bank_gold.customer_transactions` (comercio, monto, fecha, estado, `fraud_score`).                                                                                                                                   |
| **Volumen estimado**   | 21,447 contactos (3.1%).                                                                                                                                                                                             |

### 10.2.2 Cobro indebido

| Campo                  | Detalle                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Qué es**             | El cliente reclama una comisión o cargo del banco que considera mal cobrado (mantenimiento, intereses, penalidades).                    |
| **Ejemplo**            | "Me cobraron una comisión de mantenimiento que no corresponde."                                                                         |
| **Qué hace el agente** | Toma el producto afectado, el monto y la fecha, crea el caso y deriva. No puede verificar el cobro: `transactions` no tiene comisiones. |
| **Datos**              | `bank_gold.customer_products` para identificar el producto.                                                                             |
| **Volumen estimado**   | 21,268 contactos (3.1%).                                                                                                                |

### 10.2.3 Problema con app

| Campo                  | Detalle                                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| **Qué es**             | El cliente no puede usar la app o la banca web: no ingresa, una operación falla, algo no carga. |
| **Ejemplo**            | "La app no me deja hacer transferencias desde ayer."                                            |
| **Qué hace el agente** | Registra qué falla y desde cuándo, crea el caso y deriva a soporte técnico.                     |
| **Datos**              | Ninguno para verificar; solo registra.                                                          |
| **Volumen estimado**   | 21,153 contactos (3.1%).                                                                        |

### 10.2.4 Atención en sucursal

| Campo                  | Detalle                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| **Qué es**             | El cliente reclama por la atención recibida en una sucursal: demora, trato, un trámite mal hecho. |
| **Ejemplo**            | "Esperé dos horas en la sucursal del centro y no me atendieron."                                  |
| **Qué hace el agente** | Registra la sucursal, la fecha y lo ocurrido, crea el caso y deriva.                              |
| **Datos**              | `bank_silver.branches` para identificar la sucursal.                                              |
| **Volumen estimado**   | 20,741 contactos (3.0%).                                                                          |

### 10.2.5 Calidad de servicio

| Campo                  | Detalle                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Qué es**             | El cliente reclama por la atención en general, fuera de una sucursal: un asesor del call center, tiempos de respuesta, falta de solución. |
| **Ejemplo**            | "Llamé tres veces y nadie me resolvió el problema."                                                                                       |
| **Qué hace el agente** | Registra lo ocurrido, crea el caso y deriva. Si el cliente tiene casos abiertos, se los informa.                                          |
| **Datos**              | `bank_gold.customer_cases` para ver sus casos previos.                                                                                    |
| **Volumen estimado**   | 20,730 contactos (3.0%).                                                                                                                  |

### 10.2.6 Sin subcategoría

| Campo                  | Detalle                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Qué es**             | El 10% de los reclamos no tiene subcategoría.                                                                                 |
| **Qué hace el agente** | Pregunta el motivo para clasificarlo en uno de los 5 casos anteriores. Si no encaja, lo registra como queja general y deriva. |
| **Volumen estimado**   | 11,682 contactos (1.7%).                                                                                                      |

## 10.3 Perfil operativo

Los cinco casos tienen métricas prácticamente iguales en los datos, así que se
muestran juntas.

| Métrica                                         | Valor                                                                               |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| Resueltos en el contacto                        | 43.6%                                                                               |
| Requieren seguimiento                           | 63.0%                                                                               |
| Duración mediana del contacto                   | 7.2 min                                                                             |
| Sentimiento negativo o muy negativo             | 34.9%                                                                               |
| Reclamos abiertos (Open, In Process, Escalated) | 74.9%                                                                               |
| Prioridad alta o crítica                        | 19.7%                                                                               |
| SLA incumplido                                  | 20.1%                                                                               |
| Días de resolución (promedio)                   | 15.6                                                                                |
| Canal de recepción                              | Call Center 50.3%, Email 19.9%, Web 14.7%, App 10.0%, Sucursal 4.0%, Regulador 1.1% |
| Tipo de caso                                    | Complaint 60.3%, Claim 24.7%, Request 10.1%, Suggestion 4.9%                        |

## 10.4 Patrón común

- **Una queja no se resuelve en la conversación**: solo el 43.6% se resuelve en
  el contacto y el 63% requiere seguimiento. El valor del agente está en
  registrar bien y rápido, no en resolver.
- **Solo "Cargo no reconocido" se puede verificar** contra los datos. Los otros
  cuatro casos se registran y se derivan.
- **Tres de cada cuatro reclamos siguen abiertos** y el 20% incumple el SLA.
  Consultar el estado es una necesidad real y se responde entero con
  `customer_cases`.
- **El sentimiento es más negativo** que en las consultas generales, así que el
  tono de las respuestas y la derivación a humano importan más.

## 10.5 Limitaciones de los datos

- Las transcripciones de los contactos de Queja repiten la plantilla de consulta
  de saldo; no dicen de qué se queja el cliente. Por eso los ejemplos de
  mensajes de cada caso son ilustrativos, no salen de los datos.
- La `description` de `complaints` es siempre genérica ("Queja relacionada con
  fees"), así que no hay texto real para entrenar la clasificación.
- Los reclamos no tienen `transaction_id` ni se vinculan con el contacto que los
  originó.
