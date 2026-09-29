import { describe, expect, it } from 'vitest';

import {
  creditUsage,
  formatMoney,
  groupProducts,
  type Product,
  productKind,
  signedAmount,
  summarizeProducts,
  type Transaction,
  transactionLabel,
  transactionsFor,
} from '@/lib/products';

const card = (last4: string, balance: number, limit: number, available: number): Product => ({
  productType: 'Tarjeta Crédito',
  last4,
  currency: 'USD',
  currentBalance: balance,
  creditLimit: limit,
  availableCredit: available,
});
const savings = (last4: string, balance: number): Product => ({
  productType: 'Cuenta Ahorro',
  last4,
  currency: 'USD',
  currentBalance: balance,
  creditLimit: null,
  availableCredit: null,
});
const tx = (last4: string, type: string, amount: number, merchant: string | null = null): Transaction => ({
  date: '2026-09-28T10:00:00.000Z',
  productType: 'Tarjeta Crédito',
  last4,
  type,
  merchant,
  amount,
  currency: 'USD',
  status: 'Approved',
});

describe('products', () => {
  it('tells cards from savings and groups them', () => {
    expect(productKind(card('1070', 1, 10, 9))).toBe('credit');
    expect(productKind(savings('5555', 1))).toBe('savings');
    const groups = groupProducts([card('1070', 1, 10, 9), savings('5555', 1)]);
    expect(groups.map((g) => g.label)).toEqual(['Cuentas', 'Tarjetas']);
  });

  it('sums savings, card debt and available credit', () => {
    expect(
      summarizeProducts([card('1070', 300, 1000, 700), card('6262', 100, 500, 400), savings('5555', 50)]),
    ).toEqual({ currency: 'USD', available: 50, debt: 400, creditAvailable: 1100 });
  });

  it('computes the share of the limit in use', () => {
    expect(creditUsage(card('1070', 250, 1000, 750))).toBe(0.25);
    expect(creditUsage(savings('5555', 10))).toBeNull();
  });

  it('filters movements by product', () => {
    const all = [tx('1070', 'Purchase', 10), tx('6262', 'Purchase', 20)];
    expect(transactionsFor(all, card('1070', 0, 1, 1))).toHaveLength(1);
    expect(transactionsFor(all)).toHaveLength(2);
  });

  it('signs and labels movements', () => {
    expect(signedAmount(tx('1070', 'Purchase', 10))).toBe(-10);
    expect(signedAmount(tx('1070', 'Payment', 10))).toBe(10);
    expect(transactionLabel(tx('1070', 'Purchase', 10, 'Supermercado'))).toBe('Supermercado');
    expect(transactionLabel(tx('1070', 'Payment', 10))).toBe('Pago');
  });

  it('formats money in the product currency', () => {
    expect(formatMoney(1234.5, 'USD')).toContain('1,234.50');
  });
});
