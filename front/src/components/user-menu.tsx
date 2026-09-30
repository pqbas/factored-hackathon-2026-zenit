import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/user-avatar';
import { useLang } from '@/contexts/LangContext';
import { isLang, LANG_NAMES, LANGS } from '@/lib/i18n';

// The avatar at the bottom of the nav rail opens the user's menu: who is
// signed in and the app's language (every screen, and the one David is asked
// to answer in).
export function UserMenu({ name, email }: { name: string; email: string | null | undefined }) {
  const { lang, setLang, t } = useLang();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="user-avatar"
          aria-label={name}
          className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <UserAvatar name={name} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground text-xs">
          {email ?? name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs">{t.language}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={lang}
          onValueChange={(value) => {
            if (isLang(value)) setLang(value);
          }}
        >
          {LANGS.map((option) => (
            <DropdownMenuRadioItem
              key={option}
              value={option}
              data-testid={`lang-option-${option}`}
              className="text-[13px]"
            >
              {LANG_NAMES[option]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
