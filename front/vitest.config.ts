import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Mirrors the aliases from vite.config.ts; unit tests don't need the rest of
// that config (dev server, back proxy, build output).
const shared = (pkg: string, file = 'index.ts') =>
  path.resolve(__dirname, `../back/packages/${pkg}/src/${file}`);

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@chat-template/core/errors': shared('core', 'errors.ts'),
      '@chat-template/core': shared('core'),
      '@chat-template/auth': shared('auth'),
      '@chat-template/db': shared('db'),
      '@chat-template/utils': shared('utils'),
      '@chat-template/ai-sdk-providers': shared('ai-sdk-providers'),
    },
    dedupe: ['ai', 'zod', 'react', 'react-dom'],
  },
});
