import useSWR from 'swr';
import { fetcher } from '@/lib/utils';
import type { DemoCustomer } from '@/lib/demo-customer-storage';

export type { DemoCustomer };

interface DemoCustomersResponse {
  customers: DemoCustomer[];
}

/**
 * Reads the demo customer list from GET /api/demo-customers. Errors are not
 * propagated: the selector just has nothing to show and the chat keeps
 * working without a sessionToken (requirement 2).
 */
export function useDemoCustomers() {
  const { data, isLoading } = useSWR<DemoCustomersResponse>(
    '/api/demo-customers',
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    },
  );

  return {
    customers: data?.customers ?? [],
    isLoading,
  };
}
