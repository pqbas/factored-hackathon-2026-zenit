import { describe, expect, it } from 'vitest';

import {
  creditUsage,
  formatMoney,
  groupProducts,
  maskNumber,
  parseDate,
  signedAmount,
  summarizeProducts,
  transactionsFor,
} from '@/lib/products';
import {
  MOCK_CUSTOMER,
  MOCK_PRODUCTS,
  MOCK_TRANSACTIONS,
  type MockProduct,
  type MockTransaction,
} from '@/mocks/products';

function product(overrides: Partial<MockProduct>): MockProduct {
  return {
    productId: 'P1',
    productType: 'Checking Account',
    productNumber: '0000111122223333',
    currency: 'ARS',
    currentBalance: 100,
    creditLimit: null,
    interestRate: null,
    openingDate: '2024-01-01',
    expirationDate: null,
    productStatus: 'Active',
    openingChannel: 'Branch',
    daysPastDue: null,
    lastTransactionDate: null,
    ...overrides,
  };
}

function tx(overrides: Partial<MockTransaction>): MockTransaction {
  return {
    transactionId: 'T1',
    transactionDate: '2026-06-01 10:00:00',
    productId: 'P1',
    transactionType: 'Purchase',
    transactionCategory: null,
    merchantName: null,
    amount: 50,
    currency: 'ARS',
    channel: null,
    transactionCity: null,
    transactionStatus: 'Approved',
    ...overrides,
  };
}

describe('products helpers', () => {
  it('masks all but the last four digits', () => {
    expect(maskNumber('4647798048915246')).toBe('•• 5246');
  });

  it('groups products and drops empty groups', () => {
    const groups = groupProducts([
      product({ productId: 'a', productType: 'Savings Account' }),
      product({ productId: 'b', productType: 'Credit Card' }),
    ]);
    expect(groups.map((g) => g.id)).toEqual(['accounts', 'cards']);
  });

  it('sums available money, debt and investments, skipping closed products', () => {
    const totals = summarizeProducts([
      product({ productType: 'Checking Account', currentBalance: 100 }),
      product({ productType: 'Debit Card', currentBalance: 100 }),
      product({ productType: 'Credit Card', currentBalance: 30 }),
      product({ productType: 'Personal Loan', currentBalance: 70 }),
      product({ productType: 'Investment', currentBalance: 500 }),
      product({ productType: 'Savings Account', currentBalance: 999, productStatus: 'Closed' }),
    ]);
    expect(totals).toEqual({ available: 100, debt: 100, invested: 500 });
  });

  it('computes credit usage only for credit cards', () => {
    expect(
      creditUsage(product({ productType: 'Credit Card', currentBalance: 25, creditLimit: 100 })),
    ).toBe(0.25);
    expect(creditUsage(product({ productType: 'Checking Account' }))).toBeNull();
  });

  it('signs deposits and adjustments as incoming, the rest as outgoing', () => {
    expect(signedAmount(tx({ transactionType: 'Deposit' }))).toBe(50);
    expect(signedAmount(tx({ transactionType: 'Adjustment' }))).toBe(50);
    expect(signedAmount(tx({ transactionType: 'Purchase' }))).toBe(-50);
  });

  it('filters by product and sorts newest first', () => {
    const list = transactionsFor(
      [
        tx({ transactionId: 'old', transactionDate: '2026-01-01 10:00:00' }),
        tx({ transactionId: 'new', transactionDate: '2026-06-01 10:00:00' }),
        tx({ transactionId: 'other', productId: 'P2' }),
      ],
      'P1',
    );
    expect(list.map((t) => t.transactionId)).toEqual(['new', 'old']);
  });

  it('parses a bare date as local midnight, not UTC', () => {
    const date = parseDate('2025-06-06');
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2025, 5, 6]);
  });

  it('formats money in the currency of the product', () => {
    expect(formatMoney(1393876.48, 'ARS')).toContain('1.393.876,48');
  });
});

describe('demo customer fixture', () => {
  it('holds one customer with products and movements from the dataset', () => {
    expect(MOCK_CUSTOMER.customerId).toBe('CUS00000322');
    expect(MOCK_PRODUCTS.length).toBeGreaterThan(0);
    const ids = new Set(MOCK_PRODUCTS.map((p) => p.productId));
    expect(MOCK_TRANSACTIONS.every((t) => ids.has(t.productId))).toBe(true);
  });
});
