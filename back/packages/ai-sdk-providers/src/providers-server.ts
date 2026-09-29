import type { LanguageModelV3 } from '@ai-sdk/provider';

import { getHostUrl } from '@chat-template/utils';
// Import auth module directly
import {
  getDatabricksToken,
  getAuthMethod,
  getDatabricksUserIdentity,
  getCachedCliHost,
} from '@chat-template/auth';
import { createDatabricksProvider } from '@databricks/ai-sdk-provider';
import { extractReasoningMiddleware, wrapLanguageModel } from 'ai';
import { shouldInjectContextForEndpoint } from './request-context';

// Header keys for passing context through streamText headers
export const CONTEXT_HEADER_CONVERSATION_ID = 'x-databricks-conversation-id';
export const CONTEXT_HEADER_USER_ID = 'x-databricks-user-id';
export const CONTEXT_HEADER_SESSION_TOKEN = 'x-databricks-session-token';

// Use centralized authentication - only on server side
async function getProviderToken(): Promise<string> {
  // First, check if we have a PAT token
  if (process.env.DATABRICKS_TOKEN) {
    console.log('Using PAT token from DATABRICKS_TOKEN env var');
    return process.env.DATABRICKS_TOKEN;
  }

  // Otherwise, use centralized authentication module
  return getDatabricksToken();
}

// Cache the workspace hostname once resolved
let cachedWorkspaceHostname: string | null = null;

// Get workspace hostname with one-time resolution and caching
export async function getWorkspaceHostname(): Promise<string> {
  if (cachedWorkspaceHostname) {
    return cachedWorkspaceHostname;
  }

  try {
    // Use the same approach as getDatabricksCurrentUser to get hostname
    const authMethod = getAuthMethod();

    if (authMethod === 'cli') {
      // For CLI auth, we need to call getDatabricksUserIdentity which handles hostname resolution
      // This will trigger the CLI auth flow and properly cache the host
      await getDatabricksUserIdentity();

      // After CLI auth succeeds, get the hostname from the CLI cache
      const cliHost = getCachedCliHost();
      if (cliHost) {
        cachedWorkspaceHostname = cliHost;
        return cachedWorkspaceHostname;
      } else {
        throw new Error(
          'CLI authentication succeeded but hostname was not cached',
        );
      }
    } else {
      // For OAuth, use the standard method
      cachedWorkspaceHostname = getHostUrl();
      return cachedWorkspaceHostname;
    }
  } catch (error) {
    throw new Error(
      `Unable to determine Databricks workspace hostname: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

// Environment variable to enable SSE logging
const LOG_SSE_EVENTS = process.env.LOG_SSE_EVENTS === 'true';

const API_PROXY = process.env.API_PROXY;

// Signals the agent attaches to each turn as custom_outputs (contract in
// back/spec/28-09-26-estado-conversacion/requirements.md §1). undefined means
// "not sent or invalid, keep what is stored"; null is a real value.
export interface AgentHandoff {
  reason: string;
  summary: string | null;
  facts: Record<string, unknown> | null;
}

export interface AgentOutputs {
  useCase?: string | null;
  intent?: string | null;
  language?: string | null;
  blocked?: boolean;
  handoff?: AgentHandoff | null;
}

const stringOrNull = (value: unknown) =>
  typeof value === 'string' || value === null ? value : undefined;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseAgentOutputs(raw: unknown): AgentOutputs {
  if (!isObject(raw)) return {};

  let handoff: AgentHandoff | null | undefined;
  if (raw.handoff === null) {
    handoff = null;
  } else if (isObject(raw.handoff) && typeof raw.handoff.reason === 'string') {
    handoff = {
      reason: raw.handoff.reason,
      summary:
        typeof raw.handoff.summary === 'string' ? raw.handoff.summary : null,
      facts: isObject(raw.handoff.facts) ? raw.handoff.facts : null,
    };
  }

  return {
    useCase: stringOrNull(raw.use_case),
    intent: stringOrNull(raw.intent),
    language: stringOrNull(raw.language),
    blocked: typeof raw.blocked === 'boolean' ? raw.blocked : undefined,
    handoff,
  };
}

const AGENT_OUTPUTS_TTL_MS = 60_000;
const agentOutputsStore = new Map<
  string,
  { outputs: AgentOutputs; timestamp: number }
>();

export function getAndClearAgentOutputs(
  conversationId: string,
): AgentOutputs | null {
  const entry = agentOutputsStore.get(conversationId);
  agentOutputsStore.delete(conversationId);

  // Evict stale entries opportunistically
  const now = Date.now();
  for (const [key, val] of agentOutputsStore) {
    if (now - val.timestamp > AGENT_OUTPUTS_TTL_MS) {
      agentOutputsStore.delete(key);
    }
  }

  return entry?.outputs ?? null;
}

// Cache for endpoint details to check task type
const endpointDetailsCache = new Map<
  string,
  { task: string | undefined; timestamp: number }
>();
const ENDPOINT_DETAILS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Checks if context should be injected based on cached endpoint details.
 * Returns true if API_PROXY is set or if the endpoint task type is agent/v2/chat or agent/v1/responses.
 */
function shouldInjectContext(): boolean {
  const servingEndpoint = process.env.DATABRICKS_SERVING_ENDPOINT;
  if (!servingEndpoint) {
    return Boolean(API_PROXY);
  }

  const cached = endpointDetailsCache.get(servingEndpoint);
  const endpointTask = cached?.task;

  return shouldInjectContextForEndpoint(endpointTask);
}

// The agent is unreachable while its App redeploys: its proxy answers
// 502/503/504, or the connection fails. That is reported as
// AgentUnavailableError so the chat can queue the turn (server/src/agent-queue.ts)
// instead of showing a technical error.
const UNAVAILABLE_STATUS = new Set([502, 503, 504]);

export class AgentUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('The agent is unavailable', { cause });
    this.name = 'AgentUnavailableError';
  }
}

export function isAgentUnavailableError(error: unknown): boolean {
  for (let e = error, depth = 0; e && depth < 5; depth++) {
    if (e instanceof Error && e.name === 'AgentUnavailableError') return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

async function fetchAgent(url: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new AgentUnavailableError(error);
  }
  if (UNAVAILABLE_STATUS.has(response.status)) {
    // Not awaited: some bodies (MSW's) never settle a cancel.
    response.body?.cancel().catch(() => {});
    throw new AgentUnavailableError(`HTTP ${response.status}`);
  }
  return response;
}

// Custom fetch function to transform Databricks responses to OpenAI format
export const databricksFetch: typeof fetch = async (input, init) => {
  const url = input.toString();
  let requestInit = init;

  // Extract context from headers (passed via streamText headers option)
  const headers = new Headers(requestInit?.headers);
  const conversationId = headers.get(CONTEXT_HEADER_CONVERSATION_ID);
  const userId = headers.get(CONTEXT_HEADER_USER_ID);
  const sessionToken = headers.get(CONTEXT_HEADER_SESSION_TOKEN);
  // Remove context headers so they don't get sent to the API
  headers.delete(CONTEXT_HEADER_CONVERSATION_ID);
  headers.delete(CONTEXT_HEADER_USER_ID);
  headers.delete(CONTEXT_HEADER_SESSION_TOKEN);
  requestInit = { ...requestInit, headers };

  // Inject context into request body if appropriate
  const hasContext = Boolean(conversationId && userId);
  if (
    (hasContext || sessionToken) &&
    requestInit?.body &&
    typeof requestInit.body === 'string' &&
    shouldInjectContext()
  ) {
    try {
      const body = JSON.parse(requestInit.body);
      if (hasContext) {
        body.context = {
          ...body.context,
          conversation_id: conversationId,
          user_id: userId,
        };
      }
      if (sessionToken) {
        body.custom_inputs = {
          ...body.custom_inputs,
          session_token: sessionToken,
        };
      }
      requestInit = { ...requestInit, body: JSON.stringify(body) };
    } catch {
      // If JSON parsing fails, pass through unchanged
    }
  }

  // Log the request being sent to Databricks
  if (requestInit?.body) {
    try {
      const requestBody =
        typeof requestInit.body === 'string' ? JSON.parse(requestInit.body) : requestInit.body;
      console.log(
        'Databricks request:',
        JSON.stringify({
          url,
          method: requestInit.method || 'POST',
          body: requestBody,
        }),
      );
    } catch (_e) {
      console.log('Databricks request (raw):', {
        url,
        method: requestInit.method || 'POST',
        body: requestInit.body,
      });
    }
  }

  const response = await fetchAgent(url, requestInit);

  const shouldWrapStream = conversationId || LOG_SSE_EVENTS;
  if (shouldWrapStream && response.body) {
    const contentType = response.headers.get('content-type') || '';
    const isSSE =
      contentType.includes('text/event-stream') ||
      contentType.includes('application/x-ndjson');

    if (isSSE) {
      const originalBody = response.body;
      const reader = originalBody.getReader();
      const decoder = new TextDecoder();
      let eventCounter = 0;

      const interceptStream = new ReadableStream({
        async pull(controller) {
          const { done, value } = await reader.read();

          if (done) {
            if (LOG_SSE_EVENTS) console.log('[SSE] Stream ended');
            controller.close();
            return;
          }

          const text = decoder.decode(value, { stream: true });
          const lines = text.split('\n').filter((line) => line.trim());

          for (const line of lines) {
            eventCounter++;
            if (line.startsWith('data:')) {
              const data = line.slice(5).trim();
              try {
                const parsed = JSON.parse(data);
                if (LOG_SSE_EVENTS) {
                  console.log(
                    `[SSE #${eventCounter}]`,
                    JSON.stringify(parsed),
                  );
                }
                if (conversationId && parsed.custom_outputs) {
                  agentOutputsStore.set(conversationId, {
                    outputs: parseAgentOutputs(parsed.custom_outputs),
                    timestamp: Date.now(),
                  });
                }
              } catch {
                if (LOG_SSE_EVENTS) {
                  console.log(`[SSE #${eventCounter}] (raw)`, data);
                }
              }
            } else if (line.trim() && LOG_SSE_EVENTS) {
              console.log(`[SSE #${eventCounter}] (line)`, line);
            }
          }

          controller.enqueue(value);
        },
        cancel() {
          reader.cancel();
        },
      });

      return new Response(interceptStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    }
  }

  return response;
};

type CachedProvider = ReturnType<typeof createDatabricksProvider>;
let oauthProviderCache: CachedProvider | null = null;
let oauthProviderCacheTime = 0;
const PROVIDER_CACHE_DURATION = 5 * 60 * 1000; // Cache provider for 5 minutes

// Helper function to get or create the Databricks provider with OAuth
async function getOrCreateDatabricksProvider(): Promise<CachedProvider> {
  // Check if we have a cached provider that's still fresh
  if (
    oauthProviderCache &&
    Date.now() - oauthProviderCacheTime < PROVIDER_CACHE_DURATION
  ) {
    console.log('Using cached OAuth provider');
    return oauthProviderCache;
  }

  console.log('Creating new OAuth provider');
  // Ensure we have a valid token before creating provider
  await getProviderToken();
  const hostname = await getWorkspaceHostname();

  // Create provider with fetch that always uses fresh token
const provider = createDatabricksProvider({
  // When using endpoints such as Agent Bricks or custom agents, we need to use remote tool calling to handle the tool calls
  useRemoteToolCalling: true,
  baseURL: `${hostname}/serving-endpoints`,
  formatUrl: ({ baseUrl, path }) => API_PROXY ?? `${baseUrl}${path}`,
  fetch: async (...[input, init]: Parameters<typeof fetch>) => {
    // Always get fresh token for each request (will use cache if valid)
    const currentToken = await getProviderToken();
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${currentToken}`);

    return databricksFetch(input, {
      ...init,
      headers,
    });
  },
});

  oauthProviderCache = provider;
  oauthProviderCacheTime = Date.now();
  return provider;
}

// Get the task type of the serving endpoint
const getEndpointDetails = async (servingEndpoint: string) => {
  const cached = endpointDetailsCache.get(servingEndpoint);
  if (
    cached &&
    Date.now() - cached.timestamp < ENDPOINT_DETAILS_CACHE_DURATION
  ) {
    return cached;
  }

  // Always get fresh token for each request (will use cache if valid)
  const currentToken = await getProviderToken();
  const hostname = await getWorkspaceHostname();
  const headers = new Headers();
  headers.set('Authorization', `Bearer ${currentToken}`);

  const response = await databricksFetch(
    `${hostname}/api/2.0/serving-endpoints/${servingEndpoint}`,
    {
      method: 'GET',
      headers,
    },
  );
  const data = (await response.json()) as { task: string | undefined };
  const returnValue = {
    task: data.task as string | undefined,
    timestamp: Date.now(),
  };
  endpointDetailsCache.set(servingEndpoint, returnValue);
  return returnValue;
};

// Create a smart provider wrapper that handles OAuth initialization
interface SmartProvider {
  languageModel(id: string): Promise<LanguageModelV3>;
}

export class OAuthAwareProvider implements SmartProvider {
  private modelCache = new Map<
    string,
    { model: LanguageModelV3; timestamp: number }
  >();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  async languageModel(id: string): Promise<LanguageModelV3> {
    // Check cache first
    const cached = this.modelCache.get(id);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      console.log(`Using cached model for ${id}`);
      return cached.model;
    }

    // Get the OAuth provider
    const provider = await getOrCreateDatabricksProvider();

    const model = await (async () => {
      if (API_PROXY) {
        // For API proxy we always use the responses agent
        return provider.responses(id);
      }
      if (id === 'title-model' || id === 'artifact-model') {
        return provider.chatCompletions(
          'databricks-meta-llama-3-3-70b-instruct',
        );
      }
      // Server-side environment validation
      if (!process.env.DATABRICKS_SERVING_ENDPOINT) {
        throw new Error(
          'Please set the DATABRICKS_SERVING_ENDPOINT environment variable to the name of an agent serving endpoint',
        );
      }

      const servingEndpoint = process.env.DATABRICKS_SERVING_ENDPOINT;
      const endpointDetails = await getEndpointDetails(servingEndpoint);

      console.log(`Creating fresh model for ${id}`);
      switch (endpointDetails.task) {
        case 'agent/v2/chat':
          return provider.chatAgent(servingEndpoint);
        case 'agent/v1/responses':
        case 'agent/v2/responses':
          return provider.responses(servingEndpoint);
        case 'llm/v1/chat':
          return provider.chatCompletions(servingEndpoint);
        default:
          return provider.responses(servingEndpoint);
      }
    })();

    const wrappedModel = wrapLanguageModel({
      model,
      middleware: [extractReasoningMiddleware({ tagName: 'think' })],
    });

    // Cache the model
    this.modelCache.set(id, { model: wrappedModel, timestamp: Date.now() });
    return wrappedModel;
  }
}

// Create a singleton instance
const providerInstance = new OAuthAwareProvider();

// Export function that returns the provider (no server function needed here)
export function getDatabricksServerProvider() {
  return providerInstance;
}
