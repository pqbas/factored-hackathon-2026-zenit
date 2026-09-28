import { expect, test } from '@playwright/test';
import { parseAgentOutputs } from '@chat-template/ai-sdk-providers';

test.describe('parseAgentOutputs', () => {
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
});
