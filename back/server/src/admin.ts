// Checks whether an email is in the ADMIN_EMAILS list (comma-separated, case
// insensitive). An unset or empty list means nobody is admin.
export function isAdminEmail(
  email: string | undefined | null,
  raw: string | undefined,
): boolean {
  if (!email) return false;

  const adminEmails = (raw || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return adminEmails.includes(email.trim().toLowerCase());
}
