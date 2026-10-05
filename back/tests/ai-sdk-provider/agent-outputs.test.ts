import { expect, test } from '@playwright/test';
import { parseAgentOutputs } from '@chat-template/ai-sdk-providers';

test.describe('parseAgentOutputs', () => {
  test('preserves the experimental fraud assessment in the existing complaint handoff', () => {
    const assessment = { scope: 'model_availability', score_status: 'not_validated',
      risk_score: null, automatic_decisions_enabled: false, review_required: true };
    const outputs = parseAgentOutputs({ handoff: {
      reason: 'complaint', summary: 'Verified charge reported by customer',
      facts: { verified_data: { merchant: 'Fixture merchant' }, fraud_assessment: assessment },
    } });
    expect(outputs.handoff?.facts?.fraud_assessment).toEqual(assessment);
    expect(outputs.handoff?.reason).toBe('complaint');
  });
  test('reads the full contract shape', () => {
    const outputs = parseAgentOutputs({
      thread_id: 'chat-1',
      use_case: 'GENERAL_INQUIRY',
      intent: 'GENERAL_INQUIRY',
      language: 'es',
      blocked: false,
      handoff: {
        reason: 'customer_request',
        summary: 'Pide un asesor.',
        facts: { condition: 'insists', tools_called: [] },
      },
    });

    expect(outputs).toEqual({
      useCase: 'GENERAL_INQUIRY',
      intent: 'GENERAL_INQUIRY',
      language: 'es',
      blocked: false,
      handoff: {
        reason: 'customer_request',
        summary: 'Pide un asesor.',
        facts: { condition: 'insists', tools_called: [] },
      },
    });
  });

  test('keeps nulls, which reset the stored value', () => {
    const outputs = parseAgentOutputs({
      use_case: null,
      intent: 'GREETING',
      language: null,
      blocked: false,
      handoff: null,
    });

    expect(outputs.useCase).toBeNull();
    expect(outputs.language).toBeNull();
    expect(outputs.handoff).toBeNull();
  });

  test('ignores missing fields and fields with the wrong type', () => {
    const outputs = parseAgentOutputs({ use_case: 42, blocked: 'yes' });

    expect(outputs).toEqual({
      useCase: undefined,
      intent: undefined,
      language: undefined,
      blocked: undefined,
      handoff: undefined,
    });
  });

  test('keeps an unknown handoff reason as text and a null summary', () => {
    const outputs = parseAgentOutputs({
      handoff: { reason: 'something_new', summary: null, facts: null },
    });

    expect(outputs.handoff).toEqual({
      reason: 'something_new',
      summary: null,
      facts: null,
    });
  });

  test('ignores a handoff without a reason', () => {
    expect(
      parseAgentOutputs({ handoff: { summary: 'x' } }).handoff,
    ).toBeUndefined();
  });

  test('returns nothing for a non-object payload', () => {
    expect(parseAgentOutputs('oops')).toEqual({});
  });

  test('reads usage, model, prompt_version and classifier', () => {
    const outputs = parseAgentOutputs({
      intent: 'GENERAL_INQUIRY',
      usage: { input_tokens: 1200, output_tokens: 300 },
      model: 'databricks-qwen3-next-80b-a3b-instruct',
      prompt_version: 'v3',
      classifier: 'llm',
    });

    expect(outputs.usage).toEqual({ inputTokens: 1200, outputTokens: 300 });
    expect(outputs.model).toBe('databricks-qwen3-next-80b-a3b-instruct');
    expect(outputs.promptVersion).toBe('v3');
    expect(outputs.classifier).toBe('llm');
  });

  test('leaves usage, model, prompt_version and classifier undefined when absent', () => {
    const outputs = parseAgentOutputs({ intent: 'GREETING' });

    expect(outputs.usage).toBeUndefined();
    expect(outputs.model).toBeUndefined();
    expect(outputs.promptVersion).toBeUndefined();
    expect(outputs.classifier).toBeUndefined();
  });

  test('drops a malformed usage whole, keeping zero as a valid count', () => {
    const bad = [
      { input_tokens: -1, output_tokens: 5 },
      { input_tokens: 1.5, output_tokens: 5 },
      { input_tokens: '10', output_tokens: 5 },
      { input_tokens: 10 },
      'lots',
      null,
    ];
    for (const usage of bad) {
      expect(
        parseAgentOutputs({ usage }).usage,
        JSON.stringify(usage),
      ).toBeUndefined();
    }
    expect(
      parseAgentOutputs({ usage: { input_tokens: 0, output_tokens: 0 } }).usage,
    ).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(
      parseAgentOutputs({ model: 7, classifier: false }).model,
    ).toBeUndefined();
  });

  test('reads the grounding guard: fired, null, absent or malformed', () => {
    expect(
      parseAgentOutputs({
        guard: {
          fired: true,
          missing_tool: 'list_transactions',
          action: 'retried_ok',
        },
      }).guard,
    ).toEqual({
      fired: true,
      missingTool: 'list_transactions',
      action: 'retried_ok',
    });
    expect(parseAgentOutputs({ guard: null }).guard).toBeNull();
    expect(parseAgentOutputs({}).guard).toBeUndefined();
    expect(
      parseAgentOutputs({ guard: { fired: 'yes' } }).guard,
    ).toBeUndefined();
    expect(parseAgentOutputs({ guard: { fired: true } }).guard).toEqual({
      fired: true,
      missingTool: null,
      action: null,
    });
  });
});
