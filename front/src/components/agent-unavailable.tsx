import { ASSISTANT_NAME } from '@/lib/assistant';

export const AGENT_UNAVAILABLE_TEXT = `${ASSISTANT_NAME} no está disponible en este momento. Intenta de nuevo en unos segundos.`;

// What the customer sees when a turn fails anyway (the request never got
// through, or an error the queue didn't cover): never the technical error.
export function AgentUnavailable() {
  return (
    <p data-testid="agent-unavailable" className="text-muted-foreground text-sm">
      {AGENT_UNAVAILABLE_TEXT}
    </p>
  );
}
