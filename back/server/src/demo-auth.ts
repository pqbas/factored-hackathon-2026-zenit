import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';

// The demo login of the AWS deployment (spec/01-10-26-aws-back). On Databricks
// Apps the platform sets the X-Forwarded-* identity headers; on AWS nobody
// does, so anybody could send them. AUTH_MODE=password stops trusting them:
// fixed users sign in with a password and carry a signed session cookie.

export type AuthMode = 'databricks' | 'password';

export function getAuthMode(
  env: Record<string, string | undefined> = process.env,
): AuthMode {
  return env.AUTH_MODE === 'password' ? 'password' : 'databricks';
}

export const SESSION_COOKIE = 'bank_session';
export const SESSION_TTL_MS = 12 * 60 * 60_000;

const demoUsersSchema = z
  .array(
    z.object({
      username: z.string().min(1),
      email: z.string().email(),
      name: z.string().min(1),
      // scrypt, as written by scripts/aws/hash-password.mjs: "<salt>:<hash>" (hex).
      passwordHash: z.string().regex(/^[0-9a-f]{32}:[0-9a-f]{128}$/),
    }),
  )
  .min(1);

export type DemoUser = z.infer<typeof demoUsersSchema>[number];

// Throws on a missing or invalid DEMO_USERS_JSON: in password mode the server
// must not start without its users.
export function parseDemoUsers(raw: string | undefined): DemoUser[] {
  if (!raw) throw new Error('DEMO_USERS_JSON is required in password mode');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('DEMO_USERS_JSON is not valid JSON');
  }
  const result = demoUsersSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`DEMO_USERS_JSON is invalid: ${result.error.message}`);
  }
  const usernames = new Set(result.data.map((u) => u.username.toLowerCase()));
  if (usernames.size !== result.data.length) {
    throw new Error('DEMO_USERS_JSON has duplicate usernames');
  }
  return result.data;
}

// The secret that signs the cookies; at least 32 characters.
export function requireSessionSecret(raw: string | undefined): string {
  if (!raw || raw.length < 32) {
    throw new Error(
      'SESSION_SECRET (32+ characters) is required in password mode',
    );
  }
  return raw;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [salt, hash] = passwordHash.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, Buffer.from(salt, 'hex'), 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// A wrong username takes as long as a wrong password.
const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));

export function findDemoUser(
  users: DemoUser[],
  username: string,
  password: string,
): DemoUser | null {
  const user = users.find(
    (u) => u.username.toLowerCase() === username.trim().toLowerCase(),
  );
  const ok = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  return user && ok ? user : null;
}

const sign = (payload: string, secret: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url');

// "<payload>.<signature>", the payload being base64url JSON { u, exp }.
export function signSession(
  session: { username: string; exp: number },
  secret: string,
) {
  const payload = Buffer.from(
    JSON.stringify({ u: session.username, exp: session.exp }),
  ).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

// The username of a cookie value, or null when it is malformed, was not
// signed with the secret or has expired.
export function readSession(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): string | null {
  if (!value) return null;
  const [payload, signature, ...rest] = value.split('.');
  if (!payload || !signature || rest.length > 0) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  try {
    const { u, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof u !== 'string' || typeof exp !== 'number' || exp <= now) {
      return null;
    }
    return u;
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined, name: string) {
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) {
      return part.slice(index + 1).trim();
    }
  }
  return undefined;
}

export function sessionCookie(
  value: string,
  secure: boolean,
  maxAgeMs: number,
) {
  return [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

// Failed logins per key (the client's IP), in memory: enough for one demo
// instance. `limit` failures inside `windowMs` block the key until the oldest
// one leaves the window.
export function createAttemptLimiter(limit = 10, windowMs = 5 * 60_000) {
  const failures = new Map<string, number[]>();
  const recent = (key: string, now: number) =>
    (failures.get(key) ?? []).filter((at) => now - at < windowMs);
  return {
    isBlocked(key: string, now = Date.now()) {
      return recent(key, now).length >= limit;
    },
    fail(key: string, now = Date.now()) {
      failures.set(key, [...recent(key, now), now]);
    },
    reset(key: string) {
      failures.delete(key);
    },
  };
}

// The client's IP behind App Runner's proxy: the proxy appends the address it
// saw to X-Forwarded-For, so only the LAST entry is trustworthy (the client
// controls whatever comes before it).
export function clientIp(
  forwardedFor: string | string[] | undefined,
  socketAddress: string | undefined,
) {
  const header = Array.isArray(forwardedFor)
    ? forwardedFor.join(',')
    : forwardedFor;
  const last = header?.split(',').at(-1)?.trim();
  return last || socketAddress || 'unknown';
}

export type DemoAuthConfig = {
  users: DemoUser[];
  secret: string;
  // Secure cookies everywhere but a local http run (SESSION_COOKIE_INSECURE=true).
  secureCookie: boolean;
};

// The password-mode configuration, or the error that makes it unusable. The
// server still starts with an error, but /ping answers 503 so the deployment
// fails its health check instead of serving a half-working app.
export function loadDemoAuthConfig(
  env: Record<string, string | undefined> = process.env,
): { config: DemoAuthConfig } | { error: string } {
  try {
    return {
      config: {
        users: parseDemoUsers(env.DEMO_USERS_JSON),
        secret: requireSessionSecret(env.SESSION_SECRET),
        secureCookie: env.SESSION_COOKIE_INSECURE !== 'true',
      },
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
