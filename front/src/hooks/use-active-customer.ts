import { useSyncExternalStore } from 'react';

import {
  getActiveCustomerToken,
  subscribeActiveCustomer,
} from '@/lib/demo-customer-storage';

// The demo customer token the app is showing right now (see
// setActiveCustomerToken).
export function useActiveCustomerToken(): string | null {
  return useSyncExternalStore(subscribeActiveCustomer, getActiveCustomerToken, () => null);
}
