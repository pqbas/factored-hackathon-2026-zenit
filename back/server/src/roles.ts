export type Role = 'admin' | 'advisor' | 'customer';

// Emails are stored and compared in one form, so the same person with a
// different capitalization in X-Forwarded-Email is still the same person.
export function normalizeEmail(email: string | undefined | null) {
  return email ? email.trim().toLowerCase() : undefined;
}

// Checks whether an email is in a comma-separated, case-insensitive list such
// as ADMIN_EMAILS. An unset or empty list matches nobody.
export function isEmailInList(
  email: string | undefined | null,
  raw: string | undefined,
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const emails = (raw || '')
    .split(',')
    .map((e) => normalizeEmail(e))
    .filter(Boolean);

  return emails.includes(normalized);
}

// One role per user, with precedence admin > advisor > customer.
export function getRole(email: string | undefined | null): Role {
  if (isEmailInList(email, process.env.ADMIN_EMAILS)) return 'admin';
  if (isEmailInList(email, process.env.ADVISOR_EMAILS)) return 'advisor';
  return 'customer';
}
