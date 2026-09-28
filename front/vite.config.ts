import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Shared code (types, errors, chat schemas) lives in ../back/packages and is compiled from source.
const shared = (pkg: string, file = 'index.ts') =>
  path.resolve(__dirname, `../back/packages/${pkg}/src/${file}`);

// Fixture customers mirrored from agent/src/db/session_repo.py's _DEFAULT_SESSIONS, so the
// front has something to select from while the back's GET /api/demo-customers (Fase 1,
// back/spec/28-09-26-identidad-cliente-conversacion/) isn't merged yet.
const DEMO_CUSTOMERS = [
  { token: 'demo-mx-1', label: 'Santiago · México' },
  { token: 'demo-co-1', label: 'Javier · Colombia' },
  { token: 'demo-ar-1', label: 'Daniela · Argentina' },
  { token: 'demo-closed', label: 'Cliente cerrado' },
  { token: 'demo-expired', label: 'Sesión vencida' },
];

// Dev-only mock for GET /api/demo-customers, registered ahead of the /api proxy so it
// answers before the request ever reaches the back. Disable with
// VITE_MOCK_DEMO_CUSTOMERS=false to hit the real back once it has the route.
// Delete this plugin once that route is on main.
function mockDemoCustomers(): Plugin {
  return {
    name: 'mock-demo-customers',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/demo-customers', (req, res, next) => {
        if (req.method !== 'GET') {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ customers: DEMO_CUSTOMERS }));
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const mockDemoCustomersEnabled = env.VITE_MOCK_DEMO_CUSTOMERS !== 'false';

  return {
    plugins: [
      react(),
      ...(mockDemoCustomersEnabled ? [mockDemoCustomers()] : []),
    ],
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
  };
});
