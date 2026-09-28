# 9. UC-01 Consultas generales: alcance

UC-01 cubre solo las dos consultas que aparecen en las conversaciones reales del
dataset:

| Consulta                                    | Respuesta del agente                                               | Datos (`bank_gold.customer_products`)                                                  |
| ------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Saldo y límite de la **tarjeta de crédito** | Saldo actual, límite y cupo disponible, en la moneda del producto. | `current_balance`, `credit_limit`, `currency`; cupo = `credit_limit - current_balance` |
| Saldo de la **cuenta de ahorros**           | Saldo actual, en la moneda de la cuenta.                           | `current_balance`, `currency`                                                          |

Las consultas filtran por el `customer_id` de la sesión y por `product_type`
(`Tarjeta Crédito` o `Cuenta Ahorro`). Si el cliente tiene más de un producto
del mismo tipo, el agente los lista con los últimos 4 dígitos
(`product_number_last4`) para que elija.

## 9.1 Volumen

| Categoría en `call_center_interactions` | Contactos   | % del total |
| --------------------------------------- | ----------- | ----------- |
| Transaccional                           | 240,056     | 35.0%       |
| Producto                                | 150,863     | 22.0%       |
| **Total UC-01**                         | **390,919** | **57.0%**   |
| Total de contactos                      | 686,296     | 100%        |

Es una cota superior: "Transaccional" también incluye contactos que no son
consultas, y el dataset no permite separarlos.

## 9.2 Análisis por categoría

Las consultas generales caen en dos categorías de `call_center_interactions`.
Para cada una se analizó qué preguntan (transcripciones) y cómo se comportan los
contactos (métricas operativas). Solo el 25% de los contactos de cada categoría
tiene transcripción.

### 9.2.1 Transaccional

240,056 contactos, de los cuales 59,786 tienen transcripción.

**Qué preguntan**

| Pregunta                       | Transcripciones | %     |
| ------------------------------ | --------------- | ----- |
| Saldo de la tarjeta de crédito | 29,936          | 50.1% |
| Saldo de la cuenta de ahorros  | 29,850          | 49.9% |

**Cómo sigue la conversación**

| Patrón después de la pregunta                      | Transcripciones | %     |
| -------------------------------------------------- | --------------- | ----- |
| Solo pregunta, sin seguimiento                     | 35,896          | 60.0% |
| Agradece y cierra                                  | 8,964           | 15.0% |
| Pregunta por el plazo ("¿cuánto tiempo tarda?")    | 8,132           | 13.6% |
| Pide más información ("¿algo más que deba saber?") | 6,794           | 11.4% |

**Perfil operativo**

| Métrica                  | Valor                                                            |
| ------------------------ | ---------------------------------------------------------------- |
| Resueltos en el contacto | 91.5%                                                            |
| Escalados                | 9.9%                                                             |
| Requieren seguimiento    | 22.1%                                                            |
| Duración mediana         | 3.4 min                                                          |
| Espera mediana           | 119 s                                                            |
| Canal                    | Llamada entrante 70%, saliente 15%, chat 10%, email 4%, video 1% |
| Sentimiento              | 100% Neutral                                                     |

### 9.2.2 Producto

150,863 contactos, de los cuales 37,658 tienen transcripción.

**Qué preguntan**

| Pregunta                       | Transcripciones | %     |
| ------------------------------ | --------------- | ----- |
| Saldo de la cuenta de ahorros  | 18,973          | 50.4% |
| Saldo de la tarjeta de crédito | 18,685          | 49.6% |

**Cómo sigue la conversación**

| Patrón después de la pregunta                      | Transcripciones | %     |
| -------------------------------------------------- | --------------- | ----- |
| Solo pregunta, sin seguimiento                     | 22,532          | 59.8% |
| Agradece y cierra                                  | 5,731           | 15.2% |
| Pregunta por el plazo ("¿cuánto tiempo tarda?")    | 5,279           | 14.0% |
| Pide más información ("¿algo más que deba saber?") | 4,116           | 10.9% |

**Perfil operativo**

| Métrica                  | Valor                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Resueltos en el contacto | 89.6%                                                                               |
| Escalados                | 10.0%                                                                               |
| Requieren seguimiento    | 23.8%                                                                               |
| Duración mediana         | 4.4 min                                                                             |
| Espera mediana           | 119 s                                                                               |
| Canal                    | Llamada entrante 70%, saliente 15%, chat 10%, email 4%, video 1%                    |
| Sentimiento              | Neutral 67.2%, Negativo 13.7%, Positivo 10.9%, Muy negativo 5.4%, Muy positivo 2.7% |

### 9.2.3 Patrón común

- **La consulta típica es una sola pregunta de saldo**, repartida mitad tarjeta
  de crédito y mitad cuenta de ahorros, y en el 60% de los casos el cliente no
  pregunta nada más.
- **El 25% restante hace una pregunta de seguimiento**: el plazo de algo (~14%)
  o si hay algo más que deba saber (~11%). El agente debe poder responder "no
  hay nada pendiente" o derivar si no tiene el dato.
- **Son contactos simples**: ~90% se resuelven en el contacto y duran 3–4
  minutos, frente a 44% de resolución y 7 minutos en Queja. Es el perfil ideal
  para automatizar.

## 9.3 Limitaciones de los datos

- Las transcripciones son plantillas: el mismo texto aparece en contactos de
  cualquier categoría (Queja, Técnico, Retención), y `detected_intents` vale
  siempre `consulta_general` o está vacío. Sirven para saber qué se pregunta, no
  cuánto ni en qué contexto.
- No hay fecha de pago ni pago mínimo de la tarjeta, así que el agente no puede
  responder "cuánto debo pagar" ni "cuándo vence mi pago".

## 9.4 Estado

Implementado en local. `GENERAL_INQUIRY` responde con los datos de
`bank_uc_consultas.get_products` (saldo, límite y cupo disponible de cada
tarjeta de crédito, saldo de cada cuenta de ahorro) y
`bank_uc_consultas.list_transactions` (los 10 movimientos más recientes, con
filtro opcional por los últimos 4 dígitos), siempre del `customer_id` de la
sesión. Tarjeta de débito, préstamos, fecha de pago, pago mínimo y
transferencias responden que todavía no están disponibles.

Pendiente: permisos y despliegue en la Phase 8.
