# Requirements: Contador de Agente AI por caso de uso

Pedido de w1:p6 (vía w1:p4, 30-09-26): las vistas de motivo de derivación
suman un selector "Bandeja | Agente AI". La lista ya filtra por caso con
`handledBy=ai_agent&useCase=…`, pero falta el contador.

1. `GET /api/advisor/conversations/counts` agrega `aiAgentByUseCase:
   Record<useCase, number>`: los chats abiertos con `handledBy` `ai_agent`,
   por el caso de uso. Con `groupBy=customer`, cuenta clientes por su
   conversación en curso.
2. Solo trae casos con conteo mayor que 0, igual que `byUseCase`. No cambia
   ningún otro campo.

Decisión: se arma con el `aiAgent` que la consulta ya calcula por fila de caso
de uso, sin otra consulta.
