import { defineConfig } from '@playwright/test';

// Pure provider/helper tests: no web servers, migration or bank fixture setup.
export default defineConfig({
  testDir: './tests/ai-sdk-provider',
  workers: 1,
  retries: 0,
  reporter: 'line',
  timeout: 20_000,
});
