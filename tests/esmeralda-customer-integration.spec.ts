import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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

  test('requires a matching high-entropy machine secret', () => {
    const secret = '0123456789abcdef0123456789abcdef';
    const wrong = '0123456789abcdef0123456789abcdee';

    expect(isValidMachineSecret(undefined, secret)).toBe(false);
    expect(isValidMachineSecret(secret, undefined)).toBe(false);
    expect(isValidMachineSecret('short-secret', 'short-secret')).toBe(false);
    expect(isValidMachineSecret(secret, 'wrong')).toBe(false);
    expect(isValidMachineSecret(secret, wrong)).toBe(false);
    expect(isValidMachineSecret(secret, secret)).toBe(true);
  });

  test('requires canonical organization, location, booking and customer identity fields', () => {
    const valid = esmeraldaConsumerCustomerSchema.safeParse({
      organization_id: ' brand-esmeralda ',
      location_id: ' location-amager ',
      booking_id: ' booking-123 ',
      full_name: 'Guest Name',
      email: 'guest@example.com',
      phone: '+45 12345678',
    });

    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.organization_id).toBe('brand-esmeralda');
      expect(valid.data.location_id).toBe('location-amager');
      expect(valid.data.booking_id).toBe('booking-123');
    }

    const invalid = esmeraldaConsumerCustomerSchema.safeParse({
      organization_id: 'brand-esmeralda',
      location_id: 'location-amager',
      booking_id: '',
      full_name: 'Guest Name',
      email: 'not-an-email',
    });

    expect(invalid.success).toBe(false);
  });

  test('customer resolver reserves normalized identity transactionally and does not blindly clear phone data', async () => {
    const resolver = await readFile(
      resolve(
        process.cwd(),
        'src/lib/integrations/esmeralda-consumer-customer.ts',
      ),
      'utf8',
    );

    expect(resolver).toContain('integrationConsumerCustomerIdentities');
    expect(resolver).toContain('db.runTransaction');
    expect(resolver).toContain("createHash('sha256')");
    expect(resolver).toContain("'identity_index_conflict'");
    expect(resolver).toContain('if (incomingPhone && normalizedPhone)');
    expect(resolver).not.toContain('normalizedPhone,\n    locationIds');
  });
});
