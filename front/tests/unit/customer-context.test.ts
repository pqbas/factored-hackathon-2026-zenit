import { describe, expect, it } from 'vitest';

import {
  caseStatus,
  customerStatusLabel,
  profileFields,
  channelLabel,
  firstTab,
  interactionTypeLabel,
  languageLabel,
  yesNo,
  formatClaim,
  formatContextDate,
  parseCustomerContext,
  priorityLabel,
  transcriptFor,
  sentimentLabel,
} from '@/lib/customer-context';

describe('parseCustomerContext', () => {
  it('reads the contract and tolerates nulls and junk', () => {
    const context = parseCustomerContext({
      customer: { customerId: 'CUS000123', firstName: 'Santiago', lastName: null },
      interactions: [
        { interactionId: 'INT1', hasTranscript: true, date: '2026-09-26T11:42:00Z', interactionType: 'Inbound Call', channel: 'Phone', resolved: 'yes', escalated: true },
        null,
      ],
      transcripts: [
        { interactionId: 'INT1', date: '2026-09-26', customerText: 'Hola', agentText: '', language: 'es', intents: 'consulta_general', topics: 'Queja' },
      ],
      cases: [{ type: 'Claim', claimedAmount: '10', status: 'Open' }],
    });
    expect(context.customer).toEqual({ customerId: 'CUS000123', firstName: 'Santiago', lastName: null });
    expect(context.interactions).toEqual([
      {
        interactionId: 'INT1',
        hasTranscript: true,
        date: '2026-09-26T11:42:00Z',
        interactionType: 'Inbound Call',
        channel: 'Phone',
        reason: null,
        resolved: null,
        escalated: true,
        sentiment: null,
      },
    ]);
    // intents and topics come as text: kept as they are.
    expect(context.transcripts[0]).toEqual({
      interactionId: 'INT1',
      date: '2026-09-26',
      customerText: 'Hola',
      agentText: null,
      language: 'es',
      intents: ['consulta_general'],
      topics: ['Queja'],
    });
    expect(parseCustomerContext({ transcripts: [{ intents: ['a', null, 'b'] }] }).transcripts[0].intents).toEqual([
      'a',
      'b',
    ]);
    expect(context.cases[0]).toMatchObject({ type: 'Claim', claimedAmount: null, status: 'Open' });
  });

  it('reads an empty body as no history', () => {
    expect(parseCustomerContext(null)).toEqual({
      customer: null,
      profile: null,
      interactions: [],
      transcripts: [],
      cases: [],
    });
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
    expect(interactionTypeLabel('Inbound Call')).toBe('Llamada entrante: llamó el cliente');
    expect(interactionTypeLabel('Outbound Call')).toBe('Llamada saliente: llamó el banco');
    expect(interactionTypeLabel('Video')).toBe('Videollamada');
    expect(interactionTypeLabel('Email')).toBe('Correo');
    expect(interactionTypeLabel('Walk-in')).toBe('Walk-in');
    expect(interactionTypeLabel(null)).toBeNull();
    expect(channelLabel('Phone')).toBe('Teléfono');
    expect(channelLabel('WEB')).toBe('Web');
    expect(channelLabel('Fax')).toBe('Fax');
    expect(channelLabel(null)).toBeNull();
    expect(languageLabel('es')).toBe('Español');
    expect(languageLabel('fr')).toBe('fr');
    expect(yesNo(true)).toBe('Sí');
    expect(yesNo(false)).toBe('No');
    expect(yesNo(null)).toBeNull();
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
    expect(formatContextDate('2026-09-26')).toBe('26 sep 2026');
    expect(formatContextDate('not a date')).toBe('not a date');
    expect(formatClaim(null, 'USD')).toBeNull();
    expect(formatClaim(1500, 'USD')).toContain('1500');
  });
});

describe('transcriptFor', () => {
  const context = parseCustomerContext({
    interactions: [
      { interactionId: 'INT1', hasTranscript: true },
      { interactionId: 'INT2', hasTranscript: false },
      { interactionId: 'INT3', hasTranscript: true },
    ],
    transcripts: [{ interactionId: 'INT1', customerText: 'Hola' }],
  });

  it('finds the transcript of an interaction by its id', () => {
    expect(transcriptFor(context, context.interactions[0])?.customerText).toBe('Hola');
  });

  it('is null without a transcript, or when the bank did not send it', () => {
    expect(transcriptFor(context, context.interactions[1])).toBeNull();
    expect(transcriptFor(context, context.interactions[2])).toBeNull();
  });
});

describe('profile', () => {
  const santiago = {
    customerId: 'CLI-FLEUCGTW5M0D',
    country: 'México',
    city: 'Tijuana',
    segment: 'Plus',
    status: 'Active',
    customerSince: '2022-07-03T18:46:46.000Z',
    products: [{ productType: 'Tarjeta Crédito', last4: '1070' }, { productType: null, last4: null }],
    contact: { email: 'santiago.contreras357@gmail.com', mobilePhone: null },
    preferredChannel: 'Phone',
  };

  it('reads the profile, and null without one', () => {
    const context = parseCustomerContext({ profile: santiago });
    expect(context.profile?.products).toEqual([{ productType: 'Tarjeta Crédito', last4: '1070' }]);
    expect(context.profile?.contact).toEqual({ email: 'santiago.contreras357@gmail.com', mobilePhone: null });
    expect(parseCustomerContext({}).profile).toBeNull();
    expect(parseCustomerContext({ profile: 'x' }).profile).toBeNull();
  });

  it('lists the data in order, without nulls or the customer id', () => {
    const fields = profileFields(parseCustomerContext({ profile: santiago }).profile);
    expect(fields.map((f) => [f.label, f.values])).toEqual([
      ['Ubicación', ['Tijuana, México']],
      ['Segmento', ['Plus']],
      ['Estado', ['Activo']],
      ['Cliente desde', ['3 jul 2022']],
      ['Productos', ['Tarjeta Crédito ••1070']],
      ['Email', ['santiago.contreras357@gmail.com']],
      ['Canal preferido', ['Teléfono']],
    ]);
    expect(JSON.stringify(fields)).not.toContain('CLI-FLEUCGTW5M0D');
  });

  it('keeps unknown values and gives nothing for an empty profile', () => {
    expect(customerStatusLabel('Dormant')).toBe('Dormant');
    expect(customerStatusLabel('Active')).toBe('Activo');
    expect(profileFields(parseCustomerContext({ profile: {} }).profile)).toEqual([]);
    expect(profileFields(null)).toEqual([]);
  });
});
