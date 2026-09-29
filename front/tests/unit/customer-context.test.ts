import { describe, expect, it } from 'vitest';

import {
  caseStatus,
  channelLabel,
  customerName,
  firstTab,
  formatClaim,
  formatContextDate,
  maskedCustomerId,
  parseCustomerContext,
  priorityLabel,
  sentimentLabel,
} from '@/lib/customer-context';

describe('parseCustomerContext', () => {
  it('reads the contract and tolerates nulls and junk', () => {
    const context = parseCustomerContext({
      customer: { customerId: 'CUS000123', firstName: 'Santiago', lastName: null },
      interactions: [{ date: '2026-09-26T11:42:00Z', channel: 'Phone', resolved: 'yes', escalated: true }, null],
      transcripts: [{ date: '2026-09-26', customerText: 'Hola', agentText: '' }],
      cases: [{ type: 'Claim', claimedAmount: '10', status: 'Open' }],
    });
    expect(context.customer).toEqual({ customerId: 'CUS000123', firstName: 'Santiago', lastName: null });
    expect(context.interactions).toEqual([
      { date: '2026-09-26T11:42:00Z', channel: 'Phone', reason: null, resolved: null, escalated: true, sentiment: null },
    ]);
    expect(context.transcripts[0]).toEqual({ date: '2026-09-26', customerText: 'Hola', agentText: null });
    expect(context.cases[0]).toMatchObject({ type: 'Claim', claimedAmount: null, status: 'Open' });
  });

  it('reads an empty body as no history', () => {
    expect(parseCustomerContext(null)).toEqual({ customer: null, interactions: [], transcripts: [], cases: [] });
  });
});

describe('firstTab', () => {
  const empty = parseCustomerContext({});
  it('opens the first tab with something in it', () => {
    expect(firstTab({ ...empty, interactions: [parseCustomerContext({ interactions: [{}] }).interactions[0]] })).toBe(
      'interactions',
    );
    expect(firstTab(empty)).toBe('cases');
  });
});

describe('labels', () => {
  it('translates warehouse values and keeps unknown ones', () => {
    expect(channelLabel('Phone')).toBe('Llamada');
    expect(channelLabel('WEB')).toBe('Web');
    expect(channelLabel('Fax')).toBe('Fax');
    expect(channelLabel(null)).toBe('Contacto');
    expect(sentimentLabel('Neutral')).toBe('Neutral');
    expect(sentimentLabel('Negative')).toBe('Negativo');
    expect(sentimentLabel(null)).toBeNull();
    expect(priorityLabel('High')).toBe('Alta');
    expect(caseStatus('In_Progress')).toEqual({ label: 'En proceso', tone: 'open' });
    expect(caseStatus('Closed')).toEqual({ label: 'Cerrado', tone: 'closed' });
    expect(caseStatus('Weird')).toEqual({ label: 'Weird', tone: 'other' });
    expect(caseStatus(null).tone).toBe('other');
  });

  it('formats names, ids, dates and amounts', () => {
    expect(customerName({ customerId: null, firstName: 'Santiago', lastName: 'Contreras' })).toBe('Santiago Contreras');
    expect(customerName(null)).toBeNull();
    expect(maskedCustomerId({ customerId: 'CUS000123', firstName: null, lastName: null })).toBe('•• 0123');
    expect(formatContextDate('2026-09-26')).toBe('26 sep 2026');
    expect(formatContextDate('not a date')).toBe('not a date');
    expect(formatClaim(null, 'USD')).toBeNull();
    expect(formatClaim(1500, 'USD')).toContain('1500');
  });
});
