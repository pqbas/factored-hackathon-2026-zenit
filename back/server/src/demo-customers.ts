import { z } from 'zod';

export type DemoCustomer = {
  token: string;
  label: string;
};

// Tokens must match the fixtures in agent/src/db/session_repo.py.
export const DEFAULT_DEMO_CUSTOMERS: DemoCustomer[] = [
  { token: 'demo-mx-1', label: 'Santiago · México' },
  { token: 'demo-co-1', label: 'Javier · Colombia' },
  { token: 'demo-ar-1', label: 'Daniela · Argentina' },
  { token: 'demo-closed', label: 'Cliente cerrado' },
  { token: 'demo-expired', label: 'Sesión vencida' },
];

const demoCustomersSchema = z.array(
  z.object({
    token: z.string().min(1),
    label: z.string().min(1),
  }),
);

/**
 * Returns the list of demo customers for the UI selector.
 *
 * Reads `DEMO_CUSTOMERS_JSON` when set, falling back to
 * `DEFAULT_DEMO_CUSTOMERS` when the variable is missing or invalid.
 */
export function getDemoCustomers(): DemoCustomer[] {
  const raw = process.env.DEMO_CUSTOMERS_JSON;
  if (!raw) {
    return DEFAULT_DEMO_CUSTOMERS;
  }

  try {
    const parsed = demoCustomersSchema.parse(JSON.parse(raw));
    return parsed;
  } catch (error) {
    console.error('Invalid DEMO_CUSTOMERS_JSON, using defaults:', error);
    return DEFAULT_DEMO_CUSTOMERS;
  }
}
