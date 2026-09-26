// Copies the built UI (../front/dist) into server/public so this app can serve it.
// Skips silently when ../front is absent (e.g. the Databricks App build, which only has back/).
import { cpSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const src = path.resolve(import.meta.dirname, '../../front/dist');
const dest = path.resolve(import.meta.dirname, '../server/public');
if (!existsSync(src)) {
  console.log(`copy-front: ${src} not found, keeping existing server/public`);
  process.exit(0);
}
rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`copy-front: ${src} -> ${dest}`);
