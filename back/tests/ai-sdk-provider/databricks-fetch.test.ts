import { expect, test } from '@playwright/test';
import {
  CONTEXT_HEADER_CONVERSATION_ID,
  CONTEXT_HEADER_SESSION_TOKEN,
  CONTEXT_HEADER_USER_ID,
  databricksFetch,
} from '@chat-template/ai-sdk-providers';

// Both env vars are set per test: shouldInjectContext() reads them live, while
// the module-level API_PROXY constant is captured once at import time.
test.describe('databricksFetch - session token injection', () => {
  const originalApiProxy = process.env.API_PROXY;
  const originalServingEndpoint = process.env.DATABRICKS_SERVING_ENDPOINT;
  const originalFetch = globalThis.fetch;

  test.beforeEach(() => {
    process.env.API_PROXY = 'http://proxy.example.com';
    process.env.DATABRICKS_SERVING_ENDPOINT = 'unit-test-endpoint';
  });

  test.afterEach(() => {
    // Note: assign '' rather than `undefined` - Node coerces an `undefined`
    // assignment to process.env into the (truthy) string "undefined".
    process.env.API_PROXY = originalApiProxy ?? '';
    process.env.DATABRICKS_SERVING_ENDPOINT = originalServingEndpoint ?? '';
    globalThis.fetch = originalFetch;
  });

  function stubFetch() {
    let capturedInit: RequestInit | undefined;
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      capturedInit = init;
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    return () => capturedInit;
  }

  test('adds custom_inputs.session_token and removes the header when present', async () => {
    const getCapturedInit = stubFetch();

    await databricksFetch('http://example.com/serving-endpoints/responses', {
      method: 'POST',
      headers: { [CONTEXT_HEADER_SESSION_TOKEN]: 'demo-mx-1' },
      body: JSON.stringify({ input: 'hi' }),
    });

    const capturedInit = getCapturedInit();
    expect(capturedInit).toBeDefined();

    const headers = new Headers(capturedInit?.headers);
    expect(headers.has(CONTEXT_HEADER_SESSION_TOKEN)).toBe(false);

    const body = JSON.parse(capturedInit?.body as string);
    expect(body.custom_inputs).toEqual({ session_token: 'demo-mx-1' });
  });

  test('does not add custom_inputs when the header is absent', async () => {
    const getCapturedInit = stubFetch();

    await databricksFetch('http://example.com/serving-endpoints/responses', {
      method: 'POST',
      headers: {},
      body: JSON.stringify({ input: 'hi' }),
    });

    const capturedInit = getCapturedInit();
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.custom_inputs).toBeUndefined();
  });

  test('preserves custom_inputs already present in the body', async () => {
    const getCapturedInit = stubFetch();

    await databricksFetch('http://example.com/serving-endpoints/responses', {
      method: 'POST',
      headers: { [CONTEXT_HEADER_SESSION_TOKEN]: 'demo-mx-1' },
      body: JSON.stringify({
        input: 'hi',
        custom_inputs: { some_other_flag: true },
      }),
    });

    const capturedInit = getCapturedInit();
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.custom_inputs).toEqual({
      some_other_flag: true,
      session_token: 'demo-mx-1',
    });
  });

  test('injection does not depend on conversationId/userId being present', async () => {
    const getCapturedInit = stubFetch();

    await databricksFetch('http://example.com/serving-endpoints/responses', {
      method: 'POST',
      // No conversation id / user id headers, only the session token.
      headers: { [CONTEXT_HEADER_SESSION_TOKEN]: 'demo-mx-1' },
      body: JSON.stringify({ input: 'hi' }),
    });

    const capturedInit = getCapturedInit();
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.custom_inputs).toEqual({ session_token: 'demo-mx-1' });
    expect(body.context).toBeUndefined();
  });

  test('still injects context when conversationId and userId are present alongside the token', async () => {
    const getCapturedInit = stubFetch();

    await databricksFetch('http://example.com/serving-endpoints/responses', {
      method: 'POST',
      headers: {
        [CONTEXT_HEADER_CONVERSATION_ID]: 'chat-1',
        [CONTEXT_HEADER_USER_ID]: 'user-1',
        [CONTEXT_HEADER_SESSION_TOKEN]: 'demo-mx-1',
      },
      body: JSON.stringify({ input: 'hi' }),
    });

    const capturedInit = getCapturedInit();
    const body = JSON.parse(capturedInit?.body as string);
    expect(body.context).toEqual({
      conversation_id: 'chat-1',
      user_id: 'user-1',
    });
    expect(body.custom_inputs).toEqual({ session_token: 'demo-mx-1' });
  });
});
