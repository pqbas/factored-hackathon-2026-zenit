# Plan: Idioma ES | PT en el chat del cliente

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/i18n.ts` | — | New: `Lang`, `MESSAGES` es/pt, `defaultLang`, `langFromCustomerLabel` |
| `src/contexts/LangContext.tsx` | — | New: `LangProvider`, `useLang()` → `{ lang, setLang, t }` |
| `src/components/lang-switch.tsx` | — | New: segmented "ES \| PT" control |
| `src/App.tsx` | existing | Modified: wraps the app in `LangProvider` |
| Chat screen components (see requirements §3) | existing | Modified: strings through `t` |
| `src/components/chat.tsx` | existing | Modified: `language` in the `POST /api/chat` body |

## Group 1: Language

1. `src/lib/i18n.ts`:
   - `type Lang = 'es' | 'pt'` and `MESSAGES: Record<Lang, Messages>`, a flat object where functions take their params (e.g. `greeting(hour, name)`).
   - `langFromCustomerLabel(label)`: "Brasil" or "Brazil" gives 'pt', else 'es'.
   - `defaultLang({ customerLabel, navigatorLanguage })` follows the order in requirements §1.6.
2. `src/contexts/LangContext.tsx`:
   - Reads `localStorage['ui:lang']` inside try/catch.
   - Without a stored value it uses `defaultLang`, with the active demo customer's label (`useActiveCustomerToken` + `useDemoCustomers`).
   - `setLang` saves the value, which then wins over the default.
   - It also sets `document.documentElement.lang`.
3. `src/App.tsx`: `LangProvider` inside `SessionProvider`.

## Group 2: UI

4. `lang-switch.tsx`: a segmented "ES | PT" control (`lang-es`, `lang-pt`, `aria-pressed`), styled like `ReasonScopeSwitch` but smaller. It goes in `chat-header.tsx` before the demo customer selector.
5. Strings through `t` in:
   - `greeting.tsx`;
   - `suggested-actions.tsx` (title, description and prompt per language);
   - `multimodal-input.tsx` (placeholder, CVV notice, "wait" toast);
   - `chat-header.tsx` (statuses, "Nueva conversación", "Sin guardar", tooltip);
   - `demo-customer-selector.tsx` (chip, hint, dataset title, lock tooltip);
   - `agent-unavailable.tsx`;
   - `chat.tsx` (`handoffNotice` takes a `lang`);
   - `app-sidebar.tsx` and `sidebar-history.tsx` (title, empty, groups, loading, delete dialog and toasts);
   - `message.tsx` ("Asesor" → "Atendente").
6. `chat.tsx`, `prepareSendMessagesRequest`: the body adds `language: langRef.current`.

## Group 3: Tests

7. `tests/unit/i18n.test.ts`:
   - `defaultLang` in its three steps;
   - `langFromCustomerLabel`;
   - `MESSAGES.es` and `MESSAGES.pt` have the same keys;
   - the greeting by hour in both languages.
8. No integration test: it's texts and a body field. Unit plus e2e cover it.
9. `back/tests/e2e/demo-customer.test.ts` (or a new `language.test.ts`):
   - With ES it greets "Buenos/Buenas…", with the placeholder "Mensaje".
   - Clicking PT shows "Bom dia/Boa tarde/Boa noite", the PT cards, the placeholder "Mensagem" and the CVV notice in PT.
   - PT survives a reload.
   - The next `POST /api/chat` carries `language: 'pt'`.
   - A Brazilian demo customer without a stored choice starts in PT.
