# Requirements: Login de demo y cierre de sesión (front, bloque 5)

La parte del front de la fase general `spec/01-10-26-despliegue-aws/` (Etapa 1, bloque 5). En AWS no existen los headers de Databricks Apps, así que el back identifica al usuario con un login de demo: usuarios fijos con contraseña y una cookie de sesión. El front agrega la pantalla de login y el cierre de sesión. En Databricks Apps no cambia nada.

## 1. Functional requirements

After this phase, the system must keep doing what it does today:

1. En Databricks Apps (`authMode: 'databricks'`) la app entra directo, como hoy, sin pantalla de login ni botón de cerrar sesión.
2. Los roles y las secciones por rol (`src/lib/roles.ts`).

And it changes in these ways:

3. En modo `password` y sin sesión, la app muestra solo la pantalla de login:
   - la marca del banco;
   - los campos "Usuario" y "Contraseña";
   - el botón "Entrar";
   - el selector de idioma ES/PT.
4. Con credenciales válidas entra a la app, con el rol que diga el back. Con credenciales inválidas muestra "Usuario o contraseña incorrectos", sin decir cuál de los dos. Con demasiados intentos (429), "Demasiados intentos. Espera un momento.". Con un error de red o del servidor, "No pudimos iniciar sesión. Intenta de nuevo.".
5. En modo `password`, la barra de íconos tiene un botón "Cerrar sesión" arriba del avatar. Cierra la sesión y vuelve al login.
6. Si la sesión vence mientras se usa la app (cualquier `/api/*` responde 401), la app vuelve al login.
7. Todo en ES y PT.

## 2. Decisions

- Contrato propuesto a w1:pC (01/10), pendiente de su OK:
  - `GET /api/session` → `{ user | null, authMode: 'databricks' | 'password' }`;
  - `POST /api/login` con `{ username, password }` → 200 con el cuerpo de sesión y la cookie HttpOnly; 401 `invalid_credentials`; 429;
  - `POST /api/logout` → 204.
- Si falta `authMode`, se trata como `databricks`. Así el front nuevo funciona igual con el back actual.
- El front no guarda la contraseña ni tokens: la sesión es la cookie HttpOnly que pone el back. No hay usuarios ni contraseñas en el código del front ni en el repo.
- No hay "recordarme", recuperación de contraseña ni registro. Es un login de demo; el login corporativo queda pendiente, por decisión de la spec general.
- El 401 se detecta en un solo lugar, un envoltorio de `fetch` instalado por el `SessionProvider`, y no en cada llamada: hay unas 15 llamadas a `/api/*` y ninguna debe quedarse sin el redirect.
- El botón de cerrar sesión va en la barra de íconos, junto al idioma y el tema, porque ahí están los ajustes de la persona. El avatar sigue siendo solo informativo.

## 3. Context

- Spec general: `/spec/01-10-26-despliegue-aws/` (bloque 5).
- Código existente: `src/contexts/SessionContext.tsx`, `src/App.tsx`, `src/components/nav-rail.tsx`, `src/lib/i18n.ts`, `src/components/lang-toggle.tsx`, `src/components/brand-mark.tsx`.
