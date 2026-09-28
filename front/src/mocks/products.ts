import fixture from './demo-customer.json';

// One customer of the LATAM Bank dummy dataset (data/dummy_output), exported by
// scripts/export-demo-customer.py. Field names follow the dataset's
// `customers`, `products` and `transactions` tables in camelCase.

export type ProductType =
  | 'Checking Account'
  | 'Savings Account'
  | 'Debit Card'
  | 'Credit Card'
  | 'Personal Loan'
  | 'Mortgage'
  | 'Investment';

export type ProductStatus = 'Active' | 'Blocked' | 'Suspended' | 'Closed';

export interface MockCustomer {
  customerId: string;
  documentNumber: string;
  documentType: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  mobilePhone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string;
  segment: string;
  creditScore: number | null;
  estimatedMonthlyIncome: number | null;
  occupation: string | null;
  maritalStatus: string | null;
  registrationDate: string;
  customerStatus: string;
}

export interface MockProduct {
  productId: string;
  productType: ProductType;
  productNumber: string;
  currency: string;
  currentBalance: number;
  creditLimit: number | null;
  interestRate: number | null;
  openingDate: string;
  expirationDate: string | null;
  productStatus: ProductStatus;
  openingChannel: string;
  daysPastDue: number | null;
  lastTransactionDate: string | null;
}

export type TransactionType =
  | 'Purchase'
  | 'Transfer'
  | 'Deposit'
  | 'Withdrawal'
  | 'Payment'
  | 'Adjustment';

export interface MockTransaction {
  transactionId: string;
  transactionDate: string;
  productId: string;
  transactionType: TransactionType;
  transactionCategory: string | null;
  merchantName: string | null;
  // Always positive in the dataset; the sign comes from the type.
  amount: number;
  currency: string;
  channel: string | null;
  transactionCity: string | null;
  transactionStatus: string;
}

type Row = Record<string, unknown>;

function camel(row: Row): Row {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()),
      value,
    ]),
  );
}

export const MOCK_CUSTOMER = camel(fixture.customer) as unknown as MockCustomer;

export const MOCK_PRODUCTS = fixture.products.map(
  (row) => camel(row) as unknown as MockProduct,
);

export const MOCK_TRANSACTIONS = fixture.transactions.map(
  (row) => camel(row) as unknown as MockTransaction,
);
