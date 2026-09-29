import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

/**
 * Dual-Mode Testing Configuration
 *
 * Tests can run in two modes:
 * - with-db: Tests with PostgreSQL database (persistent mode)
 *   - Loads .env first (contains database config)
 *   - Verifies isDatabaseAvailable() returns true
 *   - Passes database configuration to the server process
 *
 * - ephemeral: Tests without database (ephemeral mode)
 *   - Passes empty database configuration to the server process
 *
 * Set TEST_MODE environment variable to control which mode:
 * - TEST_MODE=with-db (default) - Runs with database
 * - TEST_MODE=ephemeral - Runs without database
 *
 * Run both modes sequentially: npm test
 * Run specific mode: npm run test:with-db or npm run test:ephemeral
 */

// Determine which mode to run (default: with-db)
const TEST_MODE = process.env.TEST_MODE || 'with-db';

// Load .env
if (TEST_MODE === 'with-db') {
  config({ path: ['.env'] });
}

// A local .env pointing at a real agent (API_PROXY) would send the test
// server's requests past the MSW mocks, which only match /serving-endpoints.
Reflect.deleteProperty(process.env, 'API_PROXY');

console.log(`[Playwright] Running in "${TEST_MODE}" mode)`);

// For with-db mode, verify database is available
if (TEST_MODE === 'with-db') {
  const hasDatabaseVars =
    process.env.POSTGRES_URL || (process.env.PGHOST && process.env.PGDATABASE);

  if (!hasDatabaseVars) {
    console.error(
      '\n❌ ERROR: Running with-db tests but no database configuration found!',
    );
    console.error('Expected POSTGRES_URL or PGHOST+PGDATABASE in .env');
    console.error('\nPlease either:');
    console.error('  1. Add database configuration to .env, or');
    console.error('  2. Run ephemeral tests instead: npm run test:ephemeral\n');
    // Fail instead of passing with zero tests, so `npm test` can't look green
    // when the with-db suite never ran.
    process.exit(1);
  }

  console.log('✓ Database configuration found, tests will use database');
}

// Not 3000/3001: those are the Vite and Express dev servers, and
// reuseExistingServer would run the tests against whichever one is up.
const PORT = process.env.PORT || 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  retries: 3,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 2 : 8,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retain-on-failure',
  },

  /* Configure global timeout for each test */
  timeout: 20 * 1000,
  expect: {
    timeout: 15 * 1000,
  },

  /* Configure projects */
  projects: [
    {
      name: 'unit',
      testMatch: /ai-sdk-provider\/.*.test.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'routes',
      testMatch: /routes\/.*.test.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Browser tests of the front's UI (../front), which this server doesn't
    // serve in dev. They only run when FRONT_URL points at a running front,
    // so `npm test` stays a backend-only run.
    ...(process.env.FRONT_URL
      ? [
          {
            name: 'e2e',
            testMatch: /e2e\/.*.test.ts/,
            use: {
              ...devices['Desktop Chrome'],
              baseURL: process.env.FRONT_URL,
            },
          },
        ]
      : []),
  ],

  // Start dev server before running tests
  webServer: {
    command: 'npm run dev',
    url: `${baseURL}/ping`,
    timeout: 20 * 1000,
    reuseExistingServer: !process.env.CI,
    // Mock the environment variables for the server process
    env: {
      PORT: String(PORT),
      PLAYWRIGHT: 'True',
      DATABRICKS_SERVING_ENDPOINT: 'mock-value',
      DATABRICKS_CLIENT_ID: 'mock-value',
      DATABRICKS_CLIENT_SECRET: 'mock-value',
      DATABRICKS_HOST: 'mock-value',
      DATABRICKS_WAREHOUSE_ID: 'mock-warehouse',
      // ada-<workerIndex> is admin, babbage-<workerIndex> is advisor, and
      // curie-<workerIndex> is a plain customer. workerIndex isn't capped at
      // `workers` - a fresh worker (new project, a retry) gets the next
      // index - so this covers a generous range, not just 0-7.
      ADMIN_EMAILS: Array.from(
        { length: 64 },
        (_, i) => `ada-${i}@example.com`,
      ).join(','),
      ADVISOR_EMAILS: [
        ...Array.from({ length: 64 }, (_, i) => `babbage-${i}@example.com`),
        'asesor2@example.com',
      ].join(','),
      ...(TEST_MODE === 'ephemeral'
        ? {
            POSTGRES_URL: '',
            PGHOST: '',
            PGDATABASE: '',
            PGUSER: '',
            PGPASSWORD: '',
            PGSSLMODE: '',
          }
        : {
            POSTGRES_URL: process.env.POSTGRES_URL ?? '',
            PGHOST: process.env.PGHOST ?? '',
            PGDATABASE: process.env.PGDATABASE ?? '',
            PGUSER: process.env.PGUSER ?? '',
            PGPASSWORD: process.env.PGPASSWORD ?? '',
            PGSSLMODE: process.env.PGSSLMODE ?? '',
          }),
    },
  },
});
