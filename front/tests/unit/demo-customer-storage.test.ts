import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  getChatCustomerToken,
  getLastCustomerToken,
  pickDefaultToken,
  setChatCustomerToken,
  setLastCustomerToken,
  customerFirstName,
  getActiveCustomerToken,
  setActiveCustomerToken,
  subscribeActiveCustomer,
} from '@/lib/demo-customer-storage';

const customers = [{ token: 'demo-mx-1' }, { token: 'demo-co-1' }];

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('pickDefaultToken', () => {
  it('keeps the last pick when it is still offered', () => {
    expect(pickDefaultToken(customers, 'demo-co-1')).toBe('demo-co-1');
  });

  it('falls back to the first customer', () => {
    expect(pickDefaultToken(customers, 'demo-gone')).toBe('demo-mx-1');
    expect(pickDefaultToken(customers, null)).toBe('demo-mx-1');
  });

  it('returns null with no customers', () => {
    expect(pickDefaultToken([], 'demo-mx-1')).toBeNull();
  });
});

describe('customer token storage', () => {
  it('keeps one token per chat', () => {
    setChatCustomerToken('chat-a', 'demo-mx-1');
    setChatCustomerToken('chat-b', 'demo-co-1');
    expect(getChatCustomerToken('chat-a')).toBe('demo-mx-1');
    expect(getChatCustomerToken('chat-b')).toBe('demo-co-1');
    expect(getChatCustomerToken('chat-c')).toBeNull();
  });

  it('remembers the last pick', () => {
    setLastCustomerToken('demo-ar-1');
    expect(getLastCustomerToken()).toBe('demo-ar-1');
  });

  it('does not throw when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setChatCustomerToken('chat-a', 'demo-mx-1')).not.toThrow();
    expect(() => setLastCustomerToken('demo-mx-1')).not.toThrow();
    expect(getChatCustomerToken('chat-a')).toBeNull();
    expect(getLastCustomerToken()).toBeNull();
  });
});

describe('active demo customer', () => {
  it('starts from the last pick and notifies on change', () => {
    localStorage.setItem('demo-customer:last', 'demo-mx-1');
    expect(getActiveCustomerToken()).toBe('demo-mx-1');
    const seen: (string | null)[] = [];
    const stop = subscribeActiveCustomer(() => seen.push(getActiveCustomerToken()));
    setActiveCustomerToken('demo-co-1');
    setActiveCustomerToken('demo-co-1');
    stop();
    setActiveCustomerToken('demo-mx-1');
    expect(seen).toEqual(['demo-co-1']);
  });
});

describe('customerFirstName', () => {
  it('takes the first name from the label', () => {
    expect(customerFirstName('Santiago · México')).toBe('Santiago');
    expect(customerFirstName('Daniela Sosa · Chile')).toBe('Daniela');
    expect(customerFirstName('Sesión vencida')).toBeNull();
    expect(customerFirstName(undefined)).toBeNull();
  });
});
