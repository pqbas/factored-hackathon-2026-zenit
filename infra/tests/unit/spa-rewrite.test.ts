import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../../lib/config.js';

// The function's file is plain JS for CloudFront; evaluate it to get handler.
const source = readFileSync(join(REPO_ROOT, 'infra', 'lib', 'spa-rewrite.js'), 'utf8');
const handler = new Function(`${source}; return handler;`)() as (event: {
  request: { uri: string };
}) => { uri: string };
const rewrite = (uri: string) => handler({ request: { uri } }).uri;

describe('spa-rewrite', () => {
  it('sends the app routes to index.html', () => {
    expect(rewrite('/')).toBe('/index.html');
    expect(rewrite('/chat/123')).toBe('/index.html');
    expect(rewrite('/conversations')).toBe('/index.html');
  });

  it('leaves the files alone', () => {
    expect(rewrite('/index.html')).toBe('/index.html');
    expect(rewrite('/assets/index-abc.js')).toBe('/assets/index-abc.js');
    expect(rewrite('/demo-thumbnail.png')).toBe('/demo-thumbnail.png');
  });
});
