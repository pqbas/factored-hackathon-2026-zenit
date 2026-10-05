// Who sees which section. The role only decides what the UI shows; the back
// still enforces permissions on every API call.

export type Role = 'customer' | 'advisor' | 'admin';
export type Section = 'agent' | 'products' | 'chats' | 'metrics' | 'fraud';

const ROLES: Role[] = ['customer', 'advisor', 'admin'];

// Access matrix defined by the product owner.
export const SECTION_ROLES: Record<Section, Role[]> = {
  agent: ['customer', 'advisor', 'admin'],
  products: ['customer', 'admin'],
  // Both attend; the admin also sees every user's chats.
  chats: ['advisor', 'admin'],
  // Resolution metrics are for the admin only (the back 403s everyone else).
  metrics: ['admin'],
  fraud: ['admin'],
};

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as string[]).includes(value);
}

// Local testing before the back sends `role`: `localStorage['dev:role']`,
// honored only by the Vite dev server.
function devRoleOverride(): Role | null {
  if (!import.meta.env.DEV) return null;
  try {
    const value = localStorage.getItem('dev:role');
    return isRole(value) ? value : null;
  } catch {
    return null;
  }
}

// A missing or unknown role is `customer`, the one with the fewest sections.
export function roleOf(session: { user: object | null } | null): Role {
  const override = devRoleOverride();
  if (override) return override;
  // `role` is additive in the back's session contract, so read it loosely.
  const role = (session?.user as { role?: unknown } | null)?.role;
  return isRole(role) ? role : 'customer';
}

export function canAccess(role: Role, section: Section): boolean {
  return SECTION_ROLES[section].includes(role);
}

export function sectionForPath(pathname: string): Section {
  if (pathname.startsWith('/products')) return 'products';
  if (pathname.startsWith('/conversations')) return 'chats';
  if (pathname.startsWith('/metrics')) return 'metrics';
  if (pathname.startsWith('/fraud')) return 'fraud';
  return 'agent';
}
