import { defineConfig } from '@playwright/test';

// Local UI fixtures only: no migration, database fixture or remote agent.
export default defineConfig({
  testDir: './tests/dashboard',
  workers: 1,
  retries: 0,
  reporter: 'line',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3010',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROME_BIN ?? '/usr/bin/google-chrome',
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'npm --prefix ../front run dev -- --host 127.0.0.1 --port 3010',
    url: 'http://127.0.0.1:3010',
    reuseExistingServer: true,
  },
});
