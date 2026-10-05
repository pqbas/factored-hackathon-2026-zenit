# Requirements: El idioma elegido por el cliente llega al agente

Pedido de w1:p4, con el contrato de w1:p6 (30-09-26). El chat del cliente suma
un selector ES | PT, y David responde en el idioma elegido cuando el mensaje
no lo deja claro. Del lado del back, esta fase solo transporta la elección.

1. `POST /api/chat` acepta `language: 'es' | 'pt'`, opcional, junto a
   `sessionToken`. Cualquier otro valor se ignora, sin error.
2. El back lo manda al agente como `custom_inputs.language`, igual que
   `handled_by`:
   - en vivo;
   - desde la cola: `AgentTurn` guarda el idioma del turno, porque el turno
     encolado se responde después, sin el request original.
3. Sin `language`, el request al agente queda como hoy.
4. No se persiste en `Chat`: `Chat.language` es el idioma que detecta el
   agente y no se pisa.

Decisiones:
- Un valor inválido se ignora en vez de devolver 400, porque el selector es
  una preferencia y el chat no se tiene que romper por ella.
- La regla de qué idioma gana (el mensaje, la elección o el país de la
  sesión) es del agente (w1:p3).
