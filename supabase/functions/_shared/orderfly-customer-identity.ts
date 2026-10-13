const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export function hasBookingCustomerIdentity(email: string, phone: string): boolean {
  return emailOk(email) || /\d/.test(phone);
}
