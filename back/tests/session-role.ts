import type { Page } from '@playwright/test';

export type Role = 'customer' | 'advisor' | 'admin';

// GET /api/session with a given role (or none), so UI tests don't depend on
// ADMIN_EMAILS / ADVISOR_EMAILS on the test server.
export async function mockSessionRole(page: Page, role: Role | null) {
  await page.route('**/api/session', (route) =>
    route.fulfill({
      json: {
        user: {
          email: 'tester@banco.test',
          name: 'Tester',
          ...(role ? { role } : {}),
        },
      },
    }),
  );
}
