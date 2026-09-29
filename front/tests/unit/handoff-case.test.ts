import { describe, expect, it } from 'vitest';

import { type AgentHandoff, caseFields, handoffReasonLabel, handoffReasonShort } from '@/lib/handoff-case';

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
    expect(handoffReasonLabel('complaint')).toBe('Reclamo por un cargo');
    expect(handoffReasonLabel('retention')).toBe('Cancelación de un producto');
    expect(handoffReasonLabel('case_status')).toBe('Estado de un reclamo');
    expect(handoffReasonLabel('fraud')).toBe('fraud');
    expect(handoffReasonShort('retention')).toBe('Cancelación');
  });
});

describe('caseFields', () => {
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
