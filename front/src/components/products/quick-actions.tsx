import { useNavigate } from 'react-router-dom';

import { ACTION_STYLES, ActionCard, MOVEMENTS_STYLE } from '@/components/action-card';
import { useLang } from '@/contexts/LangContext';

// The chat's first-screen options, plus "Ver movimientos", in Mis productos:
// each opens the chat with David with its message already sent.
export function QuickActions() {
  const { t } = useLang();
  const navigate = useNavigate();
  const open = (prompt: string) => navigate(`/?query=${encodeURIComponent(prompt)}`);
  const actions = [
    ...t.actions.map((action, i) => ({ ...action, ...ACTION_STYLES[i] })),
    { ...t.products.seeMovements, ...MOVEMENTS_STYLE },
  ];

  return (
    <section data-testid="quick-actions" className="flex flex-col gap-2">
      <h2 className="px-1 font-semibold text-[15px]">{t.products.quickActions}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((action, index) => (
          <ActionCard
            key={action.prompt}
            icon={action.icon}
            tint={action.tint}
            title={action.title}
            description={action.description}
            index={index}
            testId={`quick-action-${index}`}
            onClick={() => open(action.prompt)}
          />
        ))}
      </div>
    </section>
  );
}
