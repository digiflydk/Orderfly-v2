const phoneShape = /^\+?[0-9\s()./-]+$/;

export function normalizeCustomerPhone(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 80 || !phoneShape.test(trimmed)) return null;

  const hasInternationalPlus = trimmed.startsWith('+');
  const hasInternationalZeroPrefix = trimmed.startsWith('00');
  const digits = trimmed.replace(/\D/g, '');
  const normalizedDigits = hasInternationalZeroPrefix ? digits.slice(2) : digits;
  if (normalizedDigits.length < 7 || normalizedDigits.length > 15) return null;

  if (hasInternationalPlus || hasInternationalZeroPrefix) return `+${normalizedDigits}`;
  return normalizedDigits;
}
