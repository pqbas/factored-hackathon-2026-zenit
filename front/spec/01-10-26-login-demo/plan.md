# Plan: Login de demo y cierre de sesión

## Code changes

| Module | Origin | Change |
| --- | --- | --- |
| `src/lib/auth.ts` | — | New: `authModeOf(session)`, `login(username, password)`, `logout()`, `loginErrorOf(status)` |
| `src/contexts/SessionContext.tsx` | existing | Modified: exposes `authMode`, `login`, `logout`; installs the 401 handler |
| `src/pages/LoginPage.tsx` | — | New: the login screen |
| `src/App.tsx` | existing | Modified: renders `LoginPage` instead of the routes when a login is needed |
| `src/components/nav-rail.tsx` | existing | Modified: "Cerrar sesión" button in password mode |
| `src/lib/i18n.ts` | existing | Modified: `auth` texts es/pt |

## Group 1: Session

1. `src/lib/auth.ts`:
   - `authModeOf(session)`: `'password'` only when the back says so, else `'databricks'`.
   - `login()`: `POST /api/login`; returns the session, or throws `LoginError` with `kind: 'invalid' | 'rate-limited' | 'failed'`.
   - `logout()`: `POST /api/logout`.
2. `SessionContext`:
   - `authMode`; `needsLogin = authMode === 'password' && !session?.user`.
   - `login` sets the session; `logout` clears it.
   - A `fetch` wrapper installed once: a 401 from `/api/*` whose JSON body has `code === 'unauthorized'` (read from a clone of the response) clears the session, in password mode. Any other 401 passes through untouched.

## Group 2: UI

3. `LoginPage.tsx`:
   - a centered card (`BrandMark`, title, the two fields with labels, the submit, the error with `role="alert"`);
   - `LangToggle` in a corner;
   - submit on Enter; disabled while sending;
   - test ids `login-form`, `login-username`, `login-password`, `login-submit`, `login-error`.
4. `App.tsx`: while the session loads, nothing; if `needsLogin`, `LoginPage`; else the routes.
5. `nav-rail.tsx`: in password mode, a `LogOut` button (`logout-button`, tooltip "Cerrar sesión") above the avatar.

## Group 3: Tests

6. `tests/unit/auth.test.ts`: `authModeOf` (missing → databricks), and `loginErrorOf` for 401, 429 and 500.
7. No integration test.
8. `back/tests/e2e/login.test.ts` (API mocked in the browser, as in the other e2e):
   - password mode without a user shows the login and no nav rail;
   - a wrong password shows the error;
   - a right one enters with its role;
   - "Cerrar sesión" returns to the login;
   - a 401 `unauthorized` from an API returns to the login, and a 401 `unauthorized:chat` (demo customer) doesn't;
   - databricks mode shows no login and no logout button;
   - PT texts.
