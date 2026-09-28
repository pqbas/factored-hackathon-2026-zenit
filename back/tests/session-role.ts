import type { Page } from '@playwright/test';

export type Role = 'customer' | 'advisor' | 'admin';

// GET /api/session with a given role (or none), so UI tests don't depend on
// ADMIN_EMAILS / ADVISOR_EMAILS on the test server.
export async function mockSessionRole(
  page: Page,
  role: Role | null,
  email = 'tester@banco.test',
) {
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        user: {
          email,
          name: 'Tester',
          ...(role ? { role } : {}),
        },
      },
    }),
  );
}
