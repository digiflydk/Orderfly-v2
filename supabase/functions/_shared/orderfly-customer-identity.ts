const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const phoneShape = /^\+?[0-9\s()./-]+$/;

export function normalizeBookingPhone(value: string): string | null {
  const phone = value.trim();
  if (!phone || phone.length > 80 || !phoneShape.test(phone)) return null;

  const internationalPlus = phone.startsWith('+');
  const internationalZeroPrefix = phone.startsWith('00');
  const digits = phone.replace(/\D/g, '');
  const normalizedDigits = internationalZeroPrefix ? digits.slice(2) : digits;
  if (normalizedDigits.length < 7 || normalizedDigits.length > 15) return null;

  return internationalPlus || internationalZeroPrefix
    ? `+${normalizedDigits}`
    : normalizedDigits;
}

export function hasBookingCustomerIdentity(email: string, phone: string): boolean {
  return emailOk(email) || normalizeBookingPhone(phone) !== null;
}
