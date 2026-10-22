import { z } from 'zod';
import { copenhagenDay } from './day';
import { normalizeCustomerPhone } from '@/lib/customer-phone';

export const PROFILE_GENDERS = ['male', 'female', 'other', 'prefer_not_to_say'] as const;
export type MemberProfile = { phone: string; birthDate: string | null; gender: typeof PROFILE_GENDERS[number] | null };

export function validBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01') return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Omitted fields stay unchanged. Empty values explicitly clear only the displayed field.
export const profileSchema = z.object({
  phone: z.string().trim().max(80).nullable().transform(value => value ?? '').refine(value => !value || !!normalizeCustomerPhone(value)).optional(),
  birthDate: z.string().trim().max(10).nullable().transform(value => value || null).refine(value => value === null || validBirthDate(value)).optional(),
  gender: z.union([z.enum(PROFILE_GENDERS), z.literal(''), z.null()]).transform(value => value || null).optional(),
}).strict().refine(value => Object.keys(value).length > 0);
export type ProfileInput = z.infer<typeof profileSchema>;

export function profileFromCustomer(customer: Record<string, unknown> | undefined, now = Date.now()): MemberProfile {
  const phone = typeof customer?.phone === 'string' ? customer.phone.trim() : '';
  const birthDate = typeof customer?.birthDate === 'string' && validBirthDate(customer.birthDate) && customer.birthDate <= copenhagenDay(now) ? customer.birthDate : null;
  const gender = PROFILE_GENDERS.includes(customer?.gender as typeof PROFILE_GENDERS[number]) ? customer!.gender as typeof PROFILE_GENDERS[number] : null;
  return { phone: normalizeCustomerPhone(phone) ? phone : '', birthDate, gender };
}
