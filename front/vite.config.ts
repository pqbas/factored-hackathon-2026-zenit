import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Shared code (types, errors, chat schemas) lives in ../back/packages and is compiled from source.
const shared = (pkg: string, file = 'index.ts') =>
  path.resolve(__dirname, `../back/packages/${pkg}/src/${file}`);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
    // Resolve these from front/node_modules even when imported from ../back/packages.
    dedupe: ['ai', 'zod', 'react', 'react-dom'],
  },
  server: {
    port: 3000,
    fs: { allow: ['..'] },
    proxy: {
      // Express server in ../back (npm run dev there listens on 3001)
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
