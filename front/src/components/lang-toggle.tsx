import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLang } from '@/contexts/LangContext';
import { LANG_NAMES } from '@/lib/i18n';

// The app's language, in the nav rail next to the theme button: every screen,
// and the one David is asked to answer in. A click switches ES <-> PT.
export function LangToggle() {
  const { lang, setLang, t } = useLang();
  const next = lang === 'es' ? 'pt' : 'es';
  const label = `${t.language}: ${LANG_NAMES[lang]}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-testid="lang-toggle"
          aria-label={label}
          onClick={() => setLang(next)}
          className="mb-1 flex size-11 items-center justify-center rounded-[10px] font-semibold text-muted-foreground text-xs uppercase tracking-wide transition-colors hover:bg-secondary hover:text-foreground"
        >
          {lang}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
