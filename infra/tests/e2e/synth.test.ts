import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { REPO_ROOT } from '../../lib/config.js';

// The real entry point: the cdk CLI runs bin/zenit.ts (cdk.json) and writes
// the template. No AWS call: the stack has no lookups.
it(
  'cdk synth writes the ZenitStack template',
  () => {
    const frontDist = mkdtempSync(join(tmpdir(), 'zenit-front-'));
    writeFileSync(join(frontDist, 'index.html'), '<html></html>');
    const out = mkdtempSync(join(tmpdir(), 'zenit-out-'));
    execFileSync(
      'npx',
      ['cdk', 'synth', '-q', '-o', out, '-c', 'backTag=e2e', '-c', 'agentTag=e2e', '-c', `frontDist=${frontDist}`],
      { cwd: join(REPO_ROOT, 'infra'), stdio: 'pipe', env: { ...process.env, CDK_DISABLE_VERSION_CHECK: '1' } },
    );
    const path = join(out, 'ZenitStack.template.json');
    expect(existsSync(path)).toBe(true);
    const template = JSON.parse(readFileSync(path, 'utf8'));
    const services = Object.values(template.Resources).filter(
      (r) => (r as { Type: string }).Type === 'AWS::AppRunner::Service',
    );
    expect(services).toHaveLength(2);
  },
  120_000,
);

it('cdk synth fails without the image tags', () => {
  expect(() =>
    execFileSync('npx', ['cdk', 'synth', '-q', '-o', mkdtempSync(join(tmpdir(), 'zenit-out-'))], {
      cwd: join(REPO_ROOT, 'infra'),
      stdio: 'pipe',
    }),
  ).toThrow(/backTag/);
}, 120_000);
