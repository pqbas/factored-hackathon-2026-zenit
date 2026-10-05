import { type FormEvent, useState, useEffect } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { LangToggle } from '@/components/lang-toggle';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useLang } from '@/contexts/LangContext';
import { useSession } from '@/contexts/SessionContext';
import { LoginError, type LoginErrorKind, fetchDemoLogins, type DemoLogin } from '@/lib/auth';

// The demo login (password mode, outside Databricks Apps). The session is the
// HttpOnly cookie the back sets: nothing is stored here.
export default function LoginPage() {
  const { t } = useLang();
  const { login } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<LoginErrorKind | null>(null);
  const [demoLogins, setDemoLogins] = useState<DemoLogin[]>([]);
  useEffect(() => {
    let active = true;
    void fetchDemoLogins().then(rows => { if (active) setDemoLogins(rows); });
    return () => { active = false; };
  }, []);
  const selectDemoLogin = (row: DemoLogin) => {
    setUsername(row.username); setPassword(row.password); setError(null);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof LoginError ? err.kind : 'failed');
      setSending(false);
    }
  }

  const message =
    error === 'invalid' ? t.auth.invalid : error === 'rate-limited' ? t.auth.rateLimited : t.auth.failed;
  const field =
    'h-10 w-full rounded-lg bg-secondary px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40';

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 py-8">
      <div className="absolute top-3 right-3">
        <TooltipProvider delayDuration={0}>
          <LangToggle />
        </TooltipProvider>
      </div>
      <form
        data-testid="login-form"
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-5 rounded-2xl bg-card px-6 py-7"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <BrandMark size={44} />
          <div className="flex flex-col gap-0.5">
            <h1 className="font-semibold text-xl tracking-tight">{t.auth.title}</h1>
            <p className="text-muted-foreground text-sm">{t.auth.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{t.auth.username}</span>
            <input
              data-testid="login-username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">{t.auth.password}</span>
            <input
              data-testid="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={field}
            />
          </label>
        </div>
        {error && (
          <p data-testid="login-error" role="alert" className="text-destructive text-sm">
            {message}
          </p>
        )}
        <button
          type="submit"
          data-testid="login-submit"
          disabled={sending}
          className="h-10 rounded-full bg-primary font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {sending ? t.auth.submitting : t.auth.submit}
        </button>
      </form>
      {demoLogins.length > 0 && <section data-testid="demo-logins" className="flex w-full max-w-sm flex-col gap-2 rounded-2xl bg-card px-6 py-5">
        <h2 className="font-medium text-sm">{t.auth.demoTitle}</h2>
        <table className="w-full text-left text-sm"><thead className="text-muted-foreground"><tr><th className="py-1 font-medium">{t.auth.username}</th><th className="py-1 font-medium">{t.auth.password}</th></tr></thead>
          <tbody>{demoLogins.map(row => <tr key={row.username} data-testid={`demo-login-${row.username}`} tabIndex={0} onClick={() => selectDemoLogin(row)} onKeyDown={event => { if (event.key === 'Enter') selectDemoLogin(row); }} className="cursor-pointer rounded hover:bg-secondary focus:bg-secondary focus:outline-none"><td className="py-1.5 pr-2">{row.username}</td><td className="py-1.5 font-mono">{row.password}</td></tr>)}</tbody>
        </table><p className="text-xs text-muted-foreground">{t.auth.demoHint}</p>
      </section>}
    </main>
  );
}
