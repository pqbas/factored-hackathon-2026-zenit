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
  savingsTransactions,
  parseSavingsHistory,
  savingsWithoutSeries,
  cardColor,
  maskedCardNumber,
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

describe('card visuals', () => {
  const card = { productType: 'Tarjeta Crédito', last4: '1070' };

  it('masks everything but the last 4 digits', () => {
    expect(maskedCardNumber('1070')).toBe('•••• •••• •••• 1070');
  });

  it('gives each card a stable color, never a gray', () => {
    expect(cardColor(card)).toBe(cardColor(card));
    expect(cardColor(card)).not.toMatch(/zinc|slate|stone|gray|neutral/);
  });
});

describe('savings history', () => {
  it('keeps valid series, points sorted by month, and drops junk', () => {
    const series = parseSavingsHistory({
      estimated: true,
      series: [
        { currency: 'USD', current: 2500, points: [{ month: '2026-09', balance: 2500 }, { month: '2026-04', balance: 16000 }, { month: 'bad', balance: 1 }] },
        { currency: 'COP', points: [] },
        { nope: true },
      ],
    });
    expect(series).toEqual([
      { currency: 'USD', current: 2500, points: [{ month: '2026-04', balance: 16000 }, { month: '2026-09', balance: 2500 }] },
    ]);
    expect(parseSavingsHistory(null)).toEqual([]);
  });

  it('lists the savings currencies without a series, with their balance', () => {
    const products = [
      { productType: 'Cuenta Ahorro', last4: '1', currency: 'USD', currentBalance: 100, creditLimit: null, availableCredit: null },
      { productType: 'Cuenta Ahorro', last4: '2', currency: 'COP', currentBalance: 50, creditLimit: null, availableCredit: null },
      { productType: 'Cuenta Ahorro', last4: '3', currency: 'COP', currentBalance: 25, creditLimit: null, availableCredit: null },
      { productType: 'Tarjeta Crédito', last4: '4', currency: 'ARS', currentBalance: 9, creditLimit: 10, availableCredit: 1 },
    ];
    const series = [{ currency: 'USD', current: 100, points: [{ month: '2026-09', balance: 100 }] }];
    expect(savingsWithoutSeries(products, series)).toEqual([{ currency: 'COP', current: 75 }]);
  });
});

describe('savingsTransactions', () => {
  it('keeps only the savings accounts movements', () => {
    const products = [
      { productType: 'Cuenta Ahorro', last4: '1', currency: 'USD', currentBalance: 1, creditLimit: null, availableCredit: null },
      { productType: 'Tarjeta Crédito', last4: '2', currency: 'USD', currentBalance: 1, creditLimit: 5, availableCredit: 4 },
    ];
    const tx = (productType: string, last4: string) => ({
      date: '2026-09-01T00:00:00.000Z', productType, last4, type: 'Deposit', merchant: null, amount: 1, currency: 'USD', status: 'Approved',
    });
    expect(savingsTransactions([tx('Cuenta Ahorro', '1'), tx('Tarjeta Crédito', '2')], products)).toEqual([tx('Cuenta Ahorro', '1')]);
  });
});
