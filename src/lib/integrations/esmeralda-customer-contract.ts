import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { normalizeCustomerPhone } from '@/lib/customer-phone';

export const esmeraldaConsumerCustomerSchema = z.object({
  organization_id: z.string().trim().min(1).max(200),
  location_id: z.string().trim().min(1).max(200),
  booking_id: z.string().trim().min(1).max(200),
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional().nullable(),
  phone: z.string().trim().max(80).optional().nullable(),
  marketing_consent: z.boolean().optional(),
}).refine(value => !value.phone?.trim() || Boolean(normalizePhone(value.phone)), {
  message: 'A valid phone number is required.',
  path: ['phone'],
}).refine(value => Boolean(value.email?.trim() || normalizePhone(value.phone)), {
  message: 'A valid email address or phone number is required.',
  path: ['email'],
});

export type EsmeraldaConsumerCustomerInput = z.infer<
  typeof esmeraldaConsumerCustomerSchema
>;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value?: string | null): string | null {
  return normalizeCustomerPhone(value);
}

export function isValidMachineSecret(
  expectedSecret: string | undefined,
  suppliedSecret: string | null | undefined,
): boolean {
  if (!expectedSecret || !suppliedSecret) return false;

  const expected = Buffer.from(expectedSecret);
  const supplied = Buffer.from(suppliedSecret);

  if (expected.length < 32 || supplied.length < 32) return false;
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(expected, supplied);
}
