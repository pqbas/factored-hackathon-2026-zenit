import { expect, test } from '@playwright/test';
import {
  buildBankUrl,
  resolveBankConfig,
  toText,
} from '../../server/src/bank-db';

test.describe('resolveBankConfig', () => {
  test('BANK_POSTGRES_URL wins over BANK_PGHOST and PGHOST', () => {
    expect(
      resolveBankConfig({
        BANK_POSTGRES_URL: 'postgresql://u:p@h:5432/d',
        BANK_PGHOST: 'bank-host',
        PGHOST: 'chats-host',
      }),
    ).toEqual({ kind: 'url', url: 'postgresql://u:p@h:5432/d' });
  });

  test('BANK_PGHOST wins over PGHOST', () => {
    const config = resolveBankConfig({
      BANK_PGHOST: 'bank-host',
      PGHOST: 'chats-host',
      PGUSER: 'sp-id',
    });
    expect(config).toMatchObject({
      kind: 'host',
      host: 'bank-host',
      database: 'databricks_postgres',
      user: 'sp-id',
      sslMode: 'require',
    });
  });

  test('falls back to PGHOST and takes its own database and user', () => {
    expect(resolveBankConfig({ PGHOST: 'chats-host' })).toMatchObject({
      host: 'chats-host',
      port: '5432',
      user: undefined,
    });
    expect(
      resolveBankConfig({
        PGHOST: 'chats-host',
        PGDATABASE: 'chats',
        PGUSER: 'chat-user',
        BANK_PGDATABASE: 'bank',
        BANK_PGUSER: 'bank-user',
      }),
    ).toMatchObject({ database: 'bank', user: 'bank-user' });
  });

  test('is null with nothing configured', () => {
    expect(resolveBankConfig({})).toBeNull();
  });

  test('buildBankUrl encodes the user and the token', () => {
    const config = resolveBankConfig({ PGHOST: 'h' });
    if (config?.kind !== 'host') throw new Error('expected a host config');
    expect(buildBankUrl(config, 'a@b.com', 'tok/en+1')).toBe(
      'postgresql://a%40b.com:tok%2Fen%2B1@h:5432/databricks_postgres?sslmode=require',
    );
  });
});

test.describe('toText', () => {
  test('keeps null as null', () => {
    expect(toText(null)).toBeNull();
    expect(toText(undefined)).toBeNull();
  });

  test('numeric stays exact as text, numbers and booleans become text', () => {
    expect(toText('3332.62')).toBe('3332.62');
    expect(toText(10)).toBe('10');
    expect(toText(BigInt(4400000))).toBe('4400000');
    expect(toText(true)).toBe('true');
    expect(toText(false)).toBe('false');
  });

  test('timestamps come as ISO', () => {
    expect(toText(new Date('2026-06-08T15:00:51Z'))).toBe(
      '2026-06-08T15:00:51.000Z',
    );
  });

  test('arrays and objects come as JSON', () => {
    expect(toText(['a', 'b'])).toBe('["a","b"]');
    expect(toText({ a: 1 })).toBe('{"a":1}');
  });
});
