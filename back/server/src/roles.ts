export type Role = 'admin' | 'advisor' | 'customer';

// Checks whether an email is in a comma-separated, case-insensitive list such
// as ADMIN_EMAILS. An unset or empty list matches nobody.
export function isEmailInList(
  email: string | undefined | null,
  raw: string | undefined,
): boolean {
  if (!email) return false;

  const emails = (raw || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return emails.includes(email.trim().toLowerCase());
}

// One role per user, with precedence admin > advisor > customer.
export function getRole(email: string | undefined | null): Role {
  if (isEmailInList(email, process.env.ADMIN_EMAILS)) return 'admin';
  if (isEmailInList(email, process.env.ADVISOR_EMAILS)) return 'advisor';
  return 'customer';
}
