import { http, HttpResponse } from 'msw';
import {
  createMockStreamResponse,
  mockSSE,
  mockMcpApprovalRequestStream,
  mockMcpApprovalApprovedStream,
  mockMcpApprovalDeniedStream,
  mockResponsesApiTextStream,
  mockResponsesApiMultiTextStream,
} from '../helpers';
import { TEST_PROMPTS } from '../prompts/routes';

// ============================================================================
// MCP Approval State Management
// ============================================================================

/**
 * State machine for MCP approval flow.
 * This tracks the state of approval requests across multiple API calls.
 */
type McpApprovalState = 'idle' | 'awaiting-approval' | 'approved' | 'denied';

let mcpApprovalState: McpApprovalState = 'idle';
const MCP_REQUEST_ID = '__fake_mcp_request_id__';

/**
 * Reset MCP approval state. Call this in test beforeEach.
 */
export function resetMcpApprovalState() {
  mcpApprovalState = 'idle';
}

// ============================================================================
// Context Injection Tracking
// ============================================================================

/**
 * Captured request contexts for testing context injection.
 * Each entry contains the context object if present, or undefined if not.
 */
export interface CapturedRequest {
  url: string;
  timestamp: number;
  context?: {
    conversation_id?: string;
    user_id?: string;
    [key: string]: unknown;
  };
  hasContext: boolean;
  customInputs?: {
    session_token?: string;
    handled_by?: string;
    [key: string]: unknown;
  };
  // Responses API request body, kept so tests can check which turns were
  // actually sent to the agent (e.g. that blocked messages are excluded).
  input?: unknown;
}

let capturedRequests: CapturedRequest[] = [];

/**
 * Reset captured requests. Call this before tests that need to verify context injection.
 */
export function resetCapturedRequests() {
  capturedRequests = [];
}

/**
 * Get all captured requests.
 */
export function getCapturedRequests(): CapturedRequest[] {
  return [...capturedRequests];
}

/**
 * Get the most recent captured request.
 */
export function getLastCapturedRequest(): CapturedRequest | undefined {
  return capturedRequests[capturedRequests.length - 1];
}

/**
 * Helper to capture request context from a request body.
 */
function captureRequestContext(url: string, body: unknown): void {
  const context = (body as { context?: CapturedRequest['context'] })?.context;
  const customInputs = (
    body as { custom_inputs?: CapturedRequest['customInputs'] }
  )?.custom_inputs;
  const input = (body as { input?: unknown }).input;
  capturedRequests.push({
    url,
    timestamp: Date.now(),
    context,
    hasContext: context !== undefined && context !== null,
    customInputs,
    input,
  });
}

/**
 * Check if the request body contains MCP approval trigger message.
 */
function isMcpTriggerMessage(body: unknown): boolean {
  const input = (body as { input?: unknown[] })?.input;
  if (!Array.isArray(input)) return false;

  return input.some((item) => {
    if (typeof item === 'object' && item !== null) {
      // Check for text content that triggers MCP
      const content = (item as { content?: unknown }).content;
      if (typeof content === 'string') {
        return content.toLowerCase().includes('trigger mcp');
      }
      // Check for array of content parts
      if (Array.isArray(content)) {
        return content.some(
          (part) =>
            typeof part === 'object' &&
            part !== null &&
            (part as { type?: string; text?: string }).type === 'input_text' &&
            (part as { text?: string }).text
              ?.toLowerCase()
              .includes('trigger mcp'),
        );
      }
    }
    return false;
  });
}

/**
 * Check if the request contains an MCP approval response.
 *
 * This can come in two forms:
 * 1. Explicit mcp_approval_response type (from server-side conversion)
 * 2. function_call_output with __approvalStatus__ in the output (from client-side addToolOutput)
 */
function containsMcpApprovalResponse(body: unknown): {
  found: boolean;
  approved: boolean;
} {
  const input = (body as { input?: unknown[] })?.input;
  if (!Array.isArray(input)) return { found: false, approved: false };

  for (const item of input) {
    if (typeof item !== 'object' || item === null) continue;

    const itemType = (item as { type?: string }).type;

    // Check for explicit mcp_approval_response type
    if (itemType === 'mcp_approval_response') {
      const approved = (item as { approve?: boolean }).approve === true;
      return { found: true, approved };
    }

    // Check for function_call_output with approval status in the output
    // This handles the case where the approval comes via addToolOutput from the client
    if (itemType === 'function_call_output') {
      const output = (item as { output?: string }).output;
      if (typeof output === 'string') {
        try {
          const parsed = JSON.parse(output);
          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            '__approvalStatus__' in parsed
          ) {
            const approved = parsed.__approvalStatus__ === true;
            return { found: true, approved };
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    }
  }

  return { found: false, approved: false };
}

// ============================================================================
// Mock Handlers
// ============================================================================

export const AGENT_OUTPUTS = {
  greeting: {
    thread_id: 'mock',
    use_case: null,
    intent: 'GREETING',
    language: 'es',
    blocked: false,
    handoff: null,
  },
  state: {
    thread_id: 'mock',
    use_case: 'GENERAL_INQUIRY',
    intent: 'GENERAL_INQUIRY',
    language: 'es',
    blocked: false,
    handoff: null,
  },
  goodbye: {
    thread_id: 'mock',
    use_case: null,
    intent: 'GOODBYE',
    language: 'es',
    blocked: false,
    handoff: null,
  },
  blocked: {
    thread_id: 'mock',
    use_case: null,
    intent: null,
    language: 'es',
    blocked: true,
    handoff: null,
  },
  handoff: {
    thread_id: 'mock',
    use_case: null,
    intent: 'HUMAN_REQUEST',
    language: 'es',
    blocked: false,
    handoff: {
      reason: 'customer_request',
      summary: 'El cliente pide hablar con un asesor.',
      facts: {
        condition: 'insists',
        use_case: null,
        intent: 'HUMAN_REQUEST',
        language: 'es',
        sentiment: 'neutral',
        case_id: null,
        tools_called: [],
        verified_data: null,
      },
    },
  },
  complaint: {
    thread_id: 'mock',
    use_case: 'COMPLAINT',
    intent: 'COMPLAINT',
    language: 'es',
    blocked: false,
    handoff: {
      reason: 'complaint',
      summary: 'Reclamo por un cargo no reconocido.',
      facts: {
        verified_data: {
          card_last4: '4930',
          merchant: 'Internet Plus',
          amount: 329.44,
          currency: 'USD',
        },
        tools_called: ['list_transactions'],
        intent: 'COMPLAINT',
        language: 'es',
        sentiment: 'negative',
      },
    },
  },
  // The handoff turn, with more text after the handoff message.
  complaintThenText: {
    thread_id: 'mock',
    use_case: 'COMPLAINT',
    intent: 'COMPLAINT',
    language: 'es',
    blocked: false,
    handoff: {
      reason: 'complaint',
      summary: 'Reclamo por un cargo no reconocido.',
      facts: null,
    },
  },
  // A plain answer with the turn's token usage, model and classifier.
  usage: {
    thread_id: 'mock',
    use_case: 'GENERAL_INQUIRY',
    intent: 'GENERAL_INQUIRY',
    language: 'es',
    blocked: false,
    handoff: null,
    usage: { input_tokens: 1200, output_tokens: 300 },
    model: 'mock-model',
    prompt_version: 'mock-prompt-v1',
    classifier: 'llm',
  },
  // The grounding guard fired: David showed movements without calling
  // list_transactions and the retry forcing it came out backed (the shape of
  // a real agent event, 29-09-26).
  guardFired: {
    thread_id: 'mock',
    use_case: 'GENERAL_INQUIRY',
    intent: 'GENERAL_INQUIRY',
    language: 'es',
    blocked: false,
    handoff: null,
    paused: false,
    usage: { input_tokens: 36592, output_tokens: 2280 },
    model: 'mock-model',
    prompt_version: 'mock-prompt-v1',
    classifier: 'llm',
    guard: {
      fired: true,
      missing_tool: 'list_transactions',
      action: 'retried_ok',
    },
  },
  // The guard ran and didn't fire.
  guardNull: {
    thread_id: 'mock',
    use_case: 'GENERAL_INQUIRY',
    intent: 'GENERAL_INQUIRY',
    language: 'es',
    blocked: false,
    handoff: null,
    paused: false,
    usage: { input_tokens: 19528, output_tokens: 624 },
    model: 'mock-model',
    prompt_version: 'mock-prompt-v1',
    classifier: 'llm',
    guard: null,
  },
  // The agent was called on a conversation it doesn't own and says nothing.
  paused: {
    thread_id: 'mock',
    use_case: 'GENERAL_INQUIRY',
    intent: 'GENERAL_INQUIRY',
    language: 'es',
    blocked: false,
    handoff: null,
    paused: true,
  },
} as const;

export const HANDOFF_TEXT =
  'Te comunico con un asesor, que ya tiene los datos de tu caso.';

// '[agent-slow:<ms>]' in the prompt: the responses endpoint waits that long
// before answering.
function agentDelayMs(body: unknown): number {
  const text = JSON.stringify((body as { input?: unknown[] })?.input?.at(-1));
  return Number(text?.match(/\[agent-slow:(\d+)\]/)?.[1] ?? 0);
}

// '[agent-down-N:<key>]' in the prompt: the agent answers 502 the first N
// times it sees that key (its App redeploying), then normally.
const agentDownRemaining = new Map<string, number>();

function agentIsDown(body: unknown): boolean {
  const text = JSON.stringify((body as { input?: unknown[] })?.input?.at(-1));
  const match = text?.match(/\[agent-down-(\d+):([^\]]+)\]/);
  if (!match) return false;
  const [, count, key] = match;
  const remaining = agentDownRemaining.get(key) ?? Number(count);
  if (remaining <= 0) return false;
  agentDownRemaining.set(key, remaining - 1);
  return true;
}

function agentOutputsFor(body: unknown) {
  const text = JSON.stringify((body as { input?: unknown[] })?.input?.at(-1));
  const key = (
    Object.keys(AGENT_OUTPUTS) as (keyof typeof AGENT_OUTPUTS)[]
  ).find((k) => text?.includes(`[agent-outputs:${k}]`));
  return key ? AGENT_OUTPUTS[key] : undefined;
}

export const handlers = [
  // Mock chat completions (FMAPI - llm/v1/chat)
  // Use RegExp for better URL matching - matches any URL ending with /chat/completions,
  // with or without an endpoint-name segment before it (the title-model call has none).
  http.post(
    /\/serving-endpoints\/(?:[^/]+\/)?chat\/completions$/,
    async (req) => {
      const body = await req.request.clone().json();
      captureRequestContext(req.request.url, body);
      if ((body as { stream?: boolean })?.stream) {
        return createMockStreamResponse(
          TEST_PROMPTS.SKY.OUTPUT_STREAM.responseSSE,
        );
      } else {
        return HttpResponse.json(TEST_PROMPTS.SKY.OUTPUT_TITLE.response);
      }
    },
  ),

  // Mock responses endpoint (agent/v1/responses)
  // URL pattern: {host}/serving-endpoints/responses
  http.post(/\/serving-endpoints\/responses$/, async (req) => {
    const body = await req.request.clone().json();
    captureRequestContext(req.request.url, body);
    const isStreaming = (body as { stream?: boolean })?.stream;

    // Check for MCP approval response in the request
    const { found: hasApprovalResponse, approved } =
      containsMcpApprovalResponse(body);

    if (hasApprovalResponse && mcpApprovalState === 'awaiting-approval') {
      // User responded to approval request
      mcpApprovalState = approved ? 'approved' : 'denied';

      if (isStreaming) {
        const stream = approved
          ? mockMcpApprovalApprovedStream({ requestId: MCP_REQUEST_ID })
          : mockMcpApprovalDeniedStream({ requestId: MCP_REQUEST_ID });
        return createMockStreamResponse(stream);
      }
    }

    // Check if this is a trigger for MCP approval
    if (isMcpTriggerMessage(body)) {
      mcpApprovalState = 'awaiting-approval';

      if (isStreaming) {
        return createMockStreamResponse(
          mockMcpApprovalRequestStream({ requestId: MCP_REQUEST_ID }),
        );
      }
    }

    if (agentIsDown(body)) {
      return new HttpResponse('Bad Gateway', { status: 502 });
    }

    const delayMs = agentDelayMs(body);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

    // Prompts containing an AGENT_OUTPUTS key make the mock attach the
    // matching custom_outputs, as the real agent does on each turn.
    const agentOutputs = agentOutputsFor(body);
    if (isStreaming && agentOutputs) {
      // Exactly what the agent streams for a paused turn: one
      // response.in_progress event with custom_outputs, then [DONE].
      if (agentOutputs === AGENT_OUTPUTS.paused) {
        return createMockStreamResponse([
          mockSSE({
            type: 'response.in_progress',
            custom_outputs: agentOutputs,
          }),
          'data: [DONE]',
        ]);
      }
      if (agentOutputs === AGENT_OUTPUTS.complaintThenText) {
        return createMockStreamResponse(
          mockResponsesApiMultiTextStream(
            [HANDOFF_TEXT, 'Mientras tanto, cuéntame si necesitas algo más.'],
            agentOutputs,
          ),
        );
      }
      return createMockStreamResponse(
        mockResponsesApiTextStream('Mock agent reply', agentOutputs),
      );
    }

    // Default response for non-MCP requests
    if (isStreaming) {
      return createMockStreamResponse(
        mockResponsesApiTextStream("It's just blue duh!"),
      );
    } else {
      return HttpResponse.json(TEST_PROMPTS.SKY.OUTPUT_TITLE.response);
    }
  }),

  // Mock fetching SCIM user
  http.get(/\/api\/2\.0\/preview\/scim\/v2\/Me$/, () => {
    return HttpResponse.json({
      id: '123',
      userName: 'test-user',
      displayName: 'Test User',
      emails: [{ value: 'test@example.com', primary: true }],
    });
  }),

  // Mock fetching endpoint details
  // Returns agent/v1/responses to enable context injection testing
  http.get(/\/api\/2\.0\/serving-endpoints\/[^/]+$/, () => {
    return HttpResponse.json({
      name: 'test-endpoint',
      task: 'agent/v1/responses',
    });
  }),

  // Mock fetching oidc token
  http.post(/\/oidc\/v1\/token$/, () => {
    return HttpResponse.json({
      access_token: 'test-token',
    });
  }),
];
