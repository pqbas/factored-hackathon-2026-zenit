import { useLang } from '@/contexts/LangContext';

// What the customer sees when a turn fails anyway (the request never got
// through, or an error the queue didn't cover): never the technical error.
export function AgentUnavailable() {
  const { t } = useLang();
  return (
    <p data-testid="agent-unavailable" className="text-muted-foreground text-sm">
      {t.agentUnavailable}
    </p>
  );
}
