import { expect, test } from '@playwright/test';
import {
  setAgentAuth,
  usesAgentToken,
} from '../../packages/ai-sdk-providers/src/agent-auth';

const databricksToken = async () => 'dbx-token';
const PROXY = 'https://agent.example/invocations';

test.describe('agent auth', () => {
  test('without AGENT_TOKEN the Databricks token goes as Bearer', async () => {
    const headers = new Headers({ 'content-type': 'application/json' });
    await setAgentAuth(headers, databricksToken, { API_PROXY: PROXY });
    expect(headers.get('authorization')).toBe('Bearer dbx-token');
    expect(headers.has('x-agent-token')).toBe(false);
    expect(headers.get('content-type')).toBe('application/json');
  });

  test('with AGENT_TOKEN and API_PROXY the shared secret goes alone', async () => {
    const headers = new Headers({ Authorization: 'Bearer stale' });
    let asked = false;
    await setAgentAuth(
      headers,
      async () => {
        asked = true;
        return 'dbx-token';
      },
      { API_PROXY: PROXY, AGENT_TOKEN: 'shared-secret' },
    );
    expect(headers.get('x-agent-token')).toBe('shared-secret');
    expect(headers.has('authorization')).toBe(false);
    // The Databricks token isn't even requested.
    expect(asked).toBe(false);
  });

  test('AGENT_TOKEN without API_PROXY never leaves for Databricks', async () => {
    const env = { AGENT_TOKEN: 'shared-secret' };
    expect(usesAgentToken(env)).toBe(false);
    const headers = new Headers();
    await setAgentAuth(headers, databricksToken, env);
    expect(headers.get('authorization')).toBe('Bearer dbx-token');
    expect(headers.has('x-agent-token')).toBe(false);
  });
});
