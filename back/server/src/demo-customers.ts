import { z } from 'zod';

export type DemoCustomer = {
  token: string;
  label: string;
  customerId: string;
  expired?: boolean;
};

// Tokens and customer ids must match agent/src/db/session_repo.py.
export const DEFAULT_DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    token: 'demo-mx-1',
    label: 'Santiago · México',
    customerId: 'CLI-FLEUCGTWGAHL',
  },
  {
    token: 'demo-mx-2',
    label: 'Eduardo · México',
    customerId: 'CLI-0IY07CEBUL79',
  },
  {
    token: 'demo-co-1',
    label: 'Javier · Colombia',
    customerId: 'CLI-7MPS3ZOPSN4Q',
  },
  {
    token: 'demo-ar-1',
    label: 'Daniela · Argentina',
    customerId: 'CLI-714PN0OOE0WX',
  },
  {
    token: 'demo-closed',
    label: 'Cliente cerrado',
    customerId: 'CLI-02Y493OHFA18',
  },
  {
    token: 'demo-expired',
    label: 'Sesión vencida',
    customerId: 'CLI-FLEUCGTWGAHL',
    expired: true,
  },
];

const demoCustomersSchema = z.array(
  z.object({
    token: z.string().min(1),
    label: z.string().min(1),
    customerId: z.string().min(1),
    expired: z.boolean().optional(),
  }),
);

// Falls back to the defaults when DEMO_CUSTOMERS_JSON is missing or invalid.
export function getDemoCustomers(): DemoCustomer[] {
  const raw = process.env.DEMO_CUSTOMERS_JSON;
  if (!raw) {
    return DEFAULT_DEMO_CUSTOMERS;
  }

  try {
    return demoCustomersSchema.parse(JSON.parse(raw));
  } catch (error) {
    console.error('Invalid DEMO_CUSTOMERS_JSON, using defaults:', error);
    return DEFAULT_DEMO_CUSTOMERS;
  }
}

// The customer behind a session token, or undefined for an unknown token.
export function findDemoCustomer(token: string): DemoCustomer | undefined {
  return getDemoCustomers().find((c) => c.token === token);
}

// The first live demo token of a customer id, or undefined.
export function tokenForCustomerId(customerId: string): string | undefined {
  return getDemoCustomers().find(
    (c) => c.customerId === customerId && !c.expired,
  )?.token;
}
