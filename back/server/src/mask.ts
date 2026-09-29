// Sensitive-data masking, ported from agent/src/llm/fallback.py
// (mask_sensitive): card numbers that pass Luhn, and CVV or password values.
const CARD_CANDIDATE = /(?:\d[ -]?){13,19}/g;
const CVV_OR_PASSWORD =
  /\b(cvv|contrase[ñn]a|senha)\b\s*(?:es|é|:|=)?\s*(\S*\d\S*)/gi;

function luhnValid(digits: string): boolean {
  let total = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  }
  return total % 10 === 0;
}

function findCardNumber(text: string): string | null {
  for (const match of text.matchAll(CARD_CANDIDATE)) {
    const digits = match[0].replace(/[ -]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      // The pattern may swallow a trailing separator; keep it out of the mask.
      return match[0].replace(/[ -]+$/, '');
    }
  }
  return null;
}

export function maskSensitive(text: string): string {
  let masked = text;
  for (
    let card = findCardNumber(masked);
    card;
    card = findCardNumber(masked)
  ) {
    masked = masked.replaceAll(card, '[NÚMERO OCULTO]');
  }
  return masked.replace(CVV_OR_PASSWORD, '[DATO OCULTO]');
}
