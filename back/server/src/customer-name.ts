import {
  getCustomerIdsWithoutName,
  setCustomerName,
} from '@chat-template/db';
import { getCustomerProfile } from './bank-data';

// Looks up the bank customer's name (customer_360) and stores it on their
// chats. On failure the name stays null and the next turn tries again.
export async function resolveCustomerName(customerId: string) {
  try {
    const { firstName, lastName } = await getCustomerProfile(customerId);
    const customerName = [firstName, lastName].filter(Boolean).join(' ');
    if (customerName) await setCustomerName({ customerId, customerName });
  } catch (error) {
    console.warn('[customerName] Lookup failed for', customerId, error);
  }
}

// Chats that got a customerId before customerName existed.
export async function backfillCustomerNames() {
  try {
    for (const customerId of await getCustomerIdsWithoutName()) {
      await resolveCustomerName(customerId);
    }
  } catch (error) {
    console.warn('[customerName] Backfill failed', error);
  }
}
