import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HandoffCard } from '@/components/conversations/handoff-card';
import type { AgentHandoff } from '@/lib/handoff-case';

const handoff: AgentHandoff = { reason: 'complaint', summary: null, verifiedData: null,
  at: '2026-10-05', resolvedAt: null, facts: { fraud_assessment: {
    scope: 'transaction_inference', score_status: 'experimental_prediction',
    score_type: 'uncalibrated_model_output', automatic_decisions_enabled: false,
    review_required: true, risk_score: 0.034012, fraud_prediction: false,
  } } };

describe('experimental prediction on the original advisor card', () => {
  it('shows a model index without calling it validated probability or confirmed fraud', () => {
    const html = renderToStaticMarkup(<HandoffCard handoff={handoff} />);
    expect(html).toContain('3.40 / 100');
    expect(html).toContain('Índice ML experimental');
    expect(html).toContain('no superado');
    expect(html).toContain('No es una probabilidad validada ni confirma fraude');
    expect(html).toContain('Requiere revisión humana');
  });

  it('keeps the unavailable notice when inference fails', () => {
    const legacy = { ...handoff, facts: { fraud_assessment: { review_required: true, risk_score: null } } };
    const html = renderToStaticMarkup(<HandoffCard handoff={legacy} />);
    expect(html).toContain('sin score validado');
    expect(html).not.toContain('fraud-model-score');
  });
});
