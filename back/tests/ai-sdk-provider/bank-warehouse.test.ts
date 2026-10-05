import { expect, test } from '@playwright/test';
import { warehouseBankStatement } from '../../server/src/bank-warehouse';

test('keeps customer values parameterized and reads the existing Gold products', () => {
  expect(warehouseBankStatement('SELECT product_type FROM bank_ro.customer_products WHERE customer_id = $1'))
    .toBe('SELECT product_type FROM workspace.bank_gold.customer_products WHERE customer_id = :p1');
});

test('rejects mutations, multiple statements and unknown tables', () => {
  for (const sql of ['DROP TABLE bank_ro.customer_products', 'SELECT 1; DELETE FROM x',
    'SELECT * FROM bank_ro.unknown', 'SELECT 1 -- comment']) {
    expect(() => warehouseBankStatement(sql)).toThrow();
  }
});

test('the existing customer-context CTE still reads only its allowlisted tables', () => {
  const statement = warehouseBankStatement('WITH recent AS (SELECT * FROM bank_ro.interaction_history WHERE customer_id = $1) SELECT * FROM recent LEFT JOIN bank_ro.call_transcripts t ON t.interaction_id = recent.interaction_id');
  expect(statement).toContain('workspace.bank_gold.interaction_history');
  expect(statement).toContain('workspace.bank_silver.call_transcripts');
  expect(statement).toContain(':p1');
  expect(() => warehouseBankStatement('WITH x AS (DELETE FROM bank_ro.customer_products) SELECT * FROM x')).toThrow();
});
