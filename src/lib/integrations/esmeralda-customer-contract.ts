import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const esmeraldaConsumerCustomerSchema = z.object({
  organization_id: z.string().min(1).max(200),
  location_id: z.string().min(1).max(200),
  booking_id: z.string().min(1).max(200),
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  phone: z.string().trim().max(80).optional().nullable(),
  marketing_consent: z.boolean().optional(),
});

export type EsmeraldaConsumerCustomerInput = z.infer<
  typeof esmeraldaConsumerCustomerSchema
>;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const hasInternationalPlus = trimmed.startsWith('+');
  const hasInternationalZeroPrefix = trimmed.startsWith('00');
  const digits = trimmed.replace(/\D/g, '');

  if (!digits) return null;
  if (hasInternationalPlus) return `+${digits}`;
  if (hasInternationalZeroPrefix) return `+${digits.slice(2)}`;

  return digits;
}

export function isValidMachineSecret(
  expectedSecret: string | undefined,
  suppliedSecret: string | null | undefined,
): boolean {
  if (!expectedSecret || !suppliedSecret) return false;

  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);

  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(expected, supplied);
}
