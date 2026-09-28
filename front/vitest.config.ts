import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Mirrors the '@' alias from vite.config.ts; unit tests don't need the rest
// of that config (dev mock, back proxy, build output).
export default defineConfig({
  test: {
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
