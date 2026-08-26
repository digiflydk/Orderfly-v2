import { expect, test } from '@playwright/test';

import {
  esmeraldaConsumerCustomerSchema,
  isValidMachineSecret,
  normalizeEmail,
  normalizePhone,
} from '../src/lib/integrations/esmeralda-customer-contract';

test.describe('Esmeralda customer integration contract', () => {
  test('normalizes email case-insensitively', () => {
    expect(normalizeEmail('  Guest.Name@Example.COM ')).toBe(
      'guest.name@example.com',
    );
  });

  test('normalizes common international phone formats', () => {
    expect(normalizePhone('+45 12 34 56 78')).toBe('+4512345678');
    expect(normalizePhone('0045 12-34-56-78')).toBe('+4512345678');
    expect(normalizePhone('12 34 56 78')).toBe('12345678');
    expect(normalizePhone('   ')).toBeNull();
  });

  test('rejects missing, wrong and length-mismatched machine secrets', () => {
    expect(isValidMachineSecret(undefined, 'secret')).toBe(false);
    expect(isValidMachineSecret('secret', undefined)).toBe(false);
    expect(isValidMachineSecret('secret', 'wrong')).toBe(false);
    expect(isValidMachineSecret('secret', 'secrex')).toBe(false);
    expect(isValidMachineSecret('secret', 'secret')).toBe(true);
  });

  test('requires canonical organization, location, booking and customer identity fields', () => {
    const valid = esmeraldaConsumerCustomerSchema.safeParse({
      organization_id: 'brand-esmeralda',
      location_id: 'location-amager',
      booking_id: 'booking-123',
      full_name: 'Guest Name',
      email: 'guest@example.com',
      phone: '+45 12345678',
    });

    expect(valid.success).toBe(true);

    const invalid = esmeraldaConsumerCustomerSchema.safeParse({
      organization_id: 'brand-esmeralda',
      location_id: 'location-amager',
      booking_id: '',
      full_name: 'Guest Name',
      email: 'not-an-email',
    });

    expect(invalid.success).toBe(false);
  });
});
