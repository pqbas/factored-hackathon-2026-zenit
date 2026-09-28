import useSWR from 'swr';

import { fetcher } from '@/lib/utils';

export type DemoCustomer = { token: string; label: string };

// A failed request leaves the list empty: the chat still works, without a
// customer token.
export function useDemoCustomers() {
  const { data, isLoading } = useSWR<{ customers: DemoCustomer[] }>(
    '/api/demo-customers',
    fetcher,
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );
  return { customers: data?.customers ?? [], isLoading };
}
