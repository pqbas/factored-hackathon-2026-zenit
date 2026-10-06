import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT, readAppYamlEnv } from '../../lib/config.js';

describe('readAppYamlEnv', () => {
  it('reads a variable of app.yaml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zenit-'));
    const path = join(dir, 'app.yaml');
    writeFileSync(path, 'env:\n  - name: A\n    value: \'{"x":1}\'\n');
    expect(readAppYamlEnv(path, 'A')).toBe('{"x":1}');
    expect(() => readAppYamlEnv(path, 'B')).toThrow('B is not in');
  });

  it('finds the demo customers and sessions in the repo', () => {
    const customers = JSON.parse(
      readAppYamlEnv(join(REPO_ROOT, 'back', 'app.yaml'), 'DEMO_CUSTOMERS_JSON'),
    );
    const sessions = JSON.parse(
      readAppYamlEnv(join(REPO_ROOT, 'agent', 'app.yaml'), 'DEMO_SESSIONS_JSON'),
    );
    expect(customers.length).toBeGreaterThan(0);
    expect(Object.keys(sessions)).toContain(customers[0].token);
  });
});
