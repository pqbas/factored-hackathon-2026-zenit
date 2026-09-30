import { useLang } from '@/contexts/LangContext';
import { LANGS } from '@/lib/i18n';
import { cn } from '@/lib/utils';

// "ES | PT" in the chat header: the screen's language and the one David is
// asked to answer in.
export function LangSwitch() {
  const { lang, setLang, t } = useLang();
  return (
    <div
      role="group"
      aria-label={t.language}
      data-testid="lang-switch"
      className="inline-flex h-7 items-center rounded-full bg-secondary p-0.5"
    >
      {LANGS.map((option) => {
        const active = option === lang;
        return (
          <button
            key={option}
            type="button"
            data-testid={`lang-${option}`}
            aria-pressed={active}
            onClick={() => setLang(option)}
            className={cn(
              'h-6 rounded-full px-2 font-medium text-[11px] uppercase transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm dark:bg-input'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
