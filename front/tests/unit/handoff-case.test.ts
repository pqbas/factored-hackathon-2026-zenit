import { describe, expect, it } from 'vitest';

import { type AgentHandoff, caseFields, fraudPrediction, handoffReasonLabel, needsFraudReview } from '@/lib/handoff-case';

const handoff = (verifiedData: Record<string, unknown> | null): AgentHandoff => ({
  reason: 'complaint',
  summary: 'Resumen',
  verifiedData,
  facts: null,
  at: '2026-09-29T10:00:00.000Z',
  resolvedAt: null,
});

describe('handoffReasonLabel', () => {
  it('names the reasons and keeps unknown ones', () => {
    // One name per reason, the filters' one.
    expect(handoffReasonLabel('complaint')).toBe('Reclamo');
    expect(handoffReasonLabel('retention')).toBe('Cancelación de producto');
    expect(handoffReasonLabel('case_status')).toBe('Estado de un reclamo');
    expect(handoffReasonLabel('fraud')).toBe('fraud');
  });
});

describe('caseFields', () => {
  it('accepts a genuine zero score and false alert while rejecting invalid predictions', () => {
    const assessment = { scope: 'transaction_inference', score_status: 'experimental_prediction',
      score_type: 'uncalibrated_model_output', automatic_decisions_enabled: false,
      review_required: true, risk_score: 0, fraud_prediction: false };
    const value = (a: Record<string, unknown>) => ({ ...handoff(null), facts: { fraud_assessment: a } });
    expect(fraudPrediction(value(assessment))).toEqual({ score: 0, alert: false });
    expect(fraudPrediction(value({ ...assessment, risk_score: 0.25, fraud_prediction: true })))
      .toEqual({ score: 25, alert: true });
    for (const risk_score of [null, '0.2', NaN, Infinity, -1, 1.1]) {
      expect(fraudPrediction(value({ ...assessment, risk_score }))).toBeNull();
    }
    expect(fraudPrediction(value({ ...assessment, automatic_decisions_enabled: true }))).toBeNull();
    expect(fraudPrediction(value({ ...assessment, scope: 'model_availability' }))).toBeNull();
    expect(caseFields(handoff({ transaction_id: 'INTERNAL-ID', merchant: 'Store' })))
      .toEqual([{ key: 'merchant', label: 'Comercio', value: 'Store' }]);
  });
  it('shows review only for a complaint with a structured assessment', () => {
    const value = handoff({ merchant: 'Verified merchant' });
    expect(needsFraudReview(value)).toBe(false);
    expect(needsFraudReview({ ...value, facts: { fraud_assessment: { review_required: true, risk_score: null } } })).toBe(true);
    expect(needsFraudReview({ ...value, reason: 'retention', facts: { fraud_assessment: { review_required: true } } })).toBe(false);
    expect(needsFraudReview({ ...value, facts: { fraud_assessment: 'fake score' } })).toBe(false);
  });
  it('shows a complaint charge as a record, values as they come', () => {
    const fields = caseFields(
      handoff({
        card_last4: '1070',
        transaction_date: '2026-09-24',
        merchant: 'SUPERMERCADO LÍDER',
        amount: 84.2,
        currency: 'USD',
        transaction_status: 'Approved',
        complaint_type: 'duplicate_charge',
        description: 'Me cobraron dos veces',
      }),
    );
    expect(fields.map((f) => [f.label, f.value])).toEqual([
      ['Tarjeta', '••1070'],
      ['Fecha del cargo', '24 sep 2026'],
      ['Comercio', 'SUPERMERCADO LÍDER'],
      ['Monto', expect.stringContaining('84,20')],
      ['Estado del cargo', 'Approved'],
      ['Tipo', 'Cobro duplicado'],
      ['Descripción', 'Me cobraron dos veces'],
    ]);
    expect(fields.find((f) => f.key === 'amount')?.value).toContain('USD');
  });

  it('shows a cancellation as product and reason', () => {
    const fields = caseFields(
      handoff({ product_type: 'Tarjeta Crédito', product_last4: '6262', currency: 'USD', reason: 'Cobran mucho' }),
    );
    expect(fields.map((f) => [f.label, f.value])).toEqual([
      ['Producto', 'Tarjeta Crédito ••6262'],
      ['Motivo', 'Cobran mucho'],
    ]);
  });

  it("keeps keys it doesn't know, and nothing without data", () => {
    expect(caseFields(handoff({ case_id: 'C-9' }))).toEqual([{ key: 'case_id', label: 'case_id', value: 'C-9' }]);
    expect(caseFields(handoff(null))).toEqual([]);
    expect(caseFields(null)).toEqual([]);
  });
});
