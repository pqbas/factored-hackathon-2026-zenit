import { expect, test } from '@playwright/test';
import { maskSensitive } from '../../server/src/mask';

test.describe('maskSensitive (same rules as the agent)', () => {
  test('masks a Luhn-valid card number, with or without separators', () => {
    expect(maskSensitive('mi tarjeta 4111 1111 1111 1111 gracias')).toBe(
      'mi tarjeta [NÚMERO OCULTO] gracias',
    );
    expect(maskSensitive('4111-1111-1111-1111')).toBe('[NÚMERO OCULTO]');
    expect(maskSensitive('4111111111111111')).toBe('[NÚMERO OCULTO]');
  });

  test('leaves digit runs that fail Luhn alone', () => {
    expect(maskSensitive('referencia 1234567890123')).toBe(
      'referencia 1234567890123',
    );
  });

  test('masks CVV and password values', () => {
    expect(maskSensitive('el cvv 123')).toBe('el [DATO OCULTO]');
    expect(maskSensitive('mi contraseña es abc123')).toBe('mi [DATO OCULTO]');
    expect(maskSensitive('minha senha: 9876')).toBe('minha [DATO OCULTO]');
  });

  test('text without sensitive data is unchanged', () => {
    expect(maskSensitive('Su saldo actual es 3.332,62 USD')).toBe(
      'Su saldo actual es 3.332,62 USD',
    );
  });
});
