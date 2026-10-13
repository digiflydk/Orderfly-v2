import {
  normalizeEmail,
  normalizePhone,
} from '@/lib/integrations/esmeralda-customer-contract';

export type CustomerIdentityFields = {
  id?: unknown;
  email?: unknown;
  normalizedEmail?: unknown;
  emailAliases?: unknown;
  phone?: unknown;
  normalizedPhone?: unknown;
  phoneAliases?: unknown;
};

export type CustomerIdentityConflictCode =
  | 'ambiguous_email_identity'
  | 'ambiguous_phone_identity'
  | 'customer_identity_conflict';

export class CustomerIdentityConflict extends Error {
  constructor(readonly code: CustomerIdentityConflictCode) {
    super(code);
    this.name = 'CustomerIdentityConflict';
  }
}

function stringValues(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function emailValues(record: CustomerIdentityFields): string[] {
  return [
    ...stringValues(record.normalizedEmail),
    ...stringValues(record.email),
    ...stringValues(record.emailAliases),
  ].map(normalizeEmail).filter(Boolean);
}

function phoneValues(record: CustomerIdentityFields): string[] {
  return [
    ...stringValues(record.normalizedPhone),
    ...stringValues(record.phone),
    ...stringValues(record.phoneAliases),
  ].map(value => normalizePhone(value)).filter((value): value is string => !!value);
}

export function customerHasEmail(
  record: CustomerIdentityFields,
  email: string,
): boolean {
  const normalizedEmail = normalizeEmail(email);
  return emailValues(record).includes(normalizedEmail);
}

export function customerHasPhone(
  record: CustomerIdentityFields,
  phone?: string | null,
): boolean {
  const normalizedPhone = normalizePhone(phone);
  return !!normalizedPhone && phoneValues(record).includes(normalizedPhone);
}

export function selectCustomerByIdentity<T extends CustomerIdentityFields>(
  customers: T[],
  email: string,
  phone: string | null | undefined,
  getId: (customer: T) => string = customer => String(customer.id || ''),
): T | null {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const emailMatches = customers.filter(customer => customerHasEmail(customer, normalizedEmail));
  const phoneMatches = normalizedPhone
    ? customers.filter(customer => customerHasPhone(customer, normalizedPhone))
    : [];

  if (emailMatches.length > 1) throw new CustomerIdentityConflict('ambiguous_email_identity');
  if (phoneMatches.length > 1) throw new CustomerIdentityConflict('ambiguous_phone_identity');
  if (emailMatches.length && phoneMatches.length
    && getId(emailMatches[0]) !== getId(phoneMatches[0])) {
    throw new CustomerIdentityConflict('customer_identity_conflict');
  }
  return emailMatches[0] || phoneMatches[0] || null;
}

export function mergeCustomerIdentity(
  existing: CustomerIdentityFields,
  email: string,
  phone?: string | null,
): Pick<CustomerIdentityFields, 'email' | 'normalizedEmail' | 'emailAliases' | 'phone' | 'normalizedPhone' | 'phoneAliases'> {
  const incomingEmail = normalizeEmail(email);
  const existingEmail = normalizeEmail(
    typeof existing.normalizedEmail === 'string'
      ? existing.normalizedEmail
      : typeof existing.email === 'string' ? existing.email : '',
  );
  const primaryEmail = existingEmail || incomingEmail;
  const emailAliases = [...new Set([
    ...stringValues(existing.emailAliases).map(normalizeEmail),
    ...(incomingEmail && incomingEmail !== primaryEmail ? [incomingEmail] : []),
  ].filter(alias => !!alias && alias !== primaryEmail))];

  const existingPhoneValue = typeof existing.phone === 'string' ? existing.phone.trim() : '';
  const existingPhone = normalizePhone(
    typeof existing.normalizedPhone === 'string' ? existing.normalizedPhone : existingPhoneValue,
  );
  const incomingPhone = normalizePhone(phone);
  const primaryPhone = existingPhone || incomingPhone;
  const phoneAliases = [...new Set([
    ...stringValues(existing.phoneAliases)
      .map(value => normalizePhone(value))
      .filter((value): value is string => !!value),
    ...(incomingPhone && incomingPhone !== primaryPhone ? [incomingPhone] : []),
  ].filter(alias => alias !== primaryPhone))];

  return {
    email: existingEmail && typeof existing.email === 'string' ? existing.email : primaryEmail,
    normalizedEmail: primaryEmail,
    emailAliases,
    ...(primaryPhone ? {
      phone: existingPhone ? (existingPhoneValue || existingPhone) : (phone || '').trim(),
      normalizedPhone: primaryPhone,
      phoneAliases,
    } : {}),
  };
}
