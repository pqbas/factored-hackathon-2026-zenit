import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { useActiveCustomerToken } from '@/hooks/use-active-customer';
import { useDemoCustomers } from '@/hooks/use-demo-customers';
import { defaultLang, isLang, type Lang, MESSAGES, type Messages } from '@/lib/i18n';

const STORAGE_KEY = 'ui:lang';

function readStoredLang(): Lang | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isLang(value) ? value : null;
  } catch {
    return null;
  }
}

type LangContextValue = { lang: Lang; setLang: (lang: Lang) => void; t: Messages };

const LangContext = createContext<LangContextValue>({
  lang: 'es',
  setLang: () => {},
  t: MESSAGES.es,
});

export function LangProvider({ children }: { children: ReactNode }) {
  const [chosen, setChosen] = useState<Lang | null>(readStoredLang);
  const { customers } = useDemoCustomers();
  const token = useActiveCustomerToken();
  const customerLabel = customers.find((c) => c.token === token)?.label;
  const lang =
    chosen ?? defaultLang({ customerLabel, navigatorLanguage: navigator.language });

  const setLang = useCallback((next: Lang) => {
    setChosen(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: it lasts until the page reloads.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t: MESSAGES[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  return useContext(LangContext);
}
