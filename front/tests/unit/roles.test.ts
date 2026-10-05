import { afterEach, describe, expect, it } from 'vitest';

import {
  canAccess,
  roleOf,
  SECTION_ROLES,
  sectionForPath,
  type Role,
  type Section,
} from '@/lib/roles';

const session = (role?: unknown) => ({
  user: { email: 'ana@banco.test', ...(role === undefined ? {} : { role }) },
});

afterEach(() => localStorage.clear());

describe('roleOf', () => {
  it('is customer without a session, a role or a known role', () => {
    expect(roleOf(null)).toBe('customer');
    expect(roleOf({ user: null })).toBe('customer');
    expect(roleOf(session())).toBe('customer');
    expect(roleOf(session('superuser'))).toBe('customer');
    expect(roleOf(session(42))).toBe('customer');
  });

  it('uses a valid role from the session', () => {
    expect(roleOf(session('advisor'))).toBe('advisor');
    expect(roleOf(session('admin'))).toBe('admin');
  });

  it('lets a valid dev:role override the session in dev', () => {
    localStorage.setItem('dev:role', 'admin');
    expect(roleOf(session('customer'))).toBe('admin');
    localStorage.setItem('dev:role', 'root');
    expect(roleOf(session('advisor'))).toBe('advisor');
  });
});

describe('canAccess', () => {
  const expected: Record<Role, Section[]> = {
    customer: ['agent', 'products'],
    advisor: ['agent', 'chats'],
    admin: ['agent', 'products', 'chats', 'metrics', 'fraud'],
  };

  it('follows the access matrix', () => {
    const sections = Object.keys(SECTION_ROLES) as Section[];
    for (const role of Object.keys(expected) as Role[]) {
      const allowed = sections.filter((section) => canAccess(role, section));
      expect(allowed.sort()).toEqual([...expected[role]].sort());
    }
  });
});

describe('sectionForPath', () => {
  it('maps each route to its section', () => {
    expect(sectionForPath('/')).toBe('agent');
    expect(sectionForPath('/chat/123')).toBe('agent');
    expect(sectionForPath('/products')).toBe('products');
    expect(sectionForPath('/conversations')).toBe('chats');
    expect(sectionForPath('/metrics')).toBe('metrics');
    expect(sectionForPath('/fraud')).toBe('fraud');
  });
});
