import { z } from 'zod';
import { deliveryPricingRulesSchema } from './pricing-schema';

export const deliveryId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const interval = z.object({ startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440) }).strict().refine(v => v.startMinute < v.endMinute);
const intervals = z.array(interval).max(12).refine(values => values.every((value, index) => index === 0 || values[index - 1].endMinute <= value.startMinute), 'Åbningstider må ikke overlappe og skal være sorteret.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const parsed = new Date(`${value}T12:00:00Z`); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value; });
export const deliverySettingsSchema = z.object({
  enabled: z.boolean(), providerId: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).nullable(), timezone: z.literal('Europe/Copenhagen'), paused: z.boolean(),
  pricingRules: deliveryPricingRulesSchema.nullable(),
  scheduleMode: z.enum(['restaurant', 'manual']).default('restaurant'),
  pickupOpeningOffsetMinutes: z.number().int().min(0).max(240).default(20),
  pickupClosingOffsetMinutes: z.number().int().min(0).max(240).default(20),
  weeklyHours: z.array(z.object({ day: z.number().int().min(0).max(6), intervals }).strict()).length(7).refine(days => new Set(days.map(day => day.day)).size === 7),
  exceptions: z.array(z.object({ date, intervals }).strict()).max(366).refine(days => new Set(days.map(day => day.date)).size === days.length),
  preparationMinutes: z.number().int().min(0).max(240), maxTransportMinutes: z.number().int().min(1).max(240), maxDistanceMeters: z.number().int().min(1).max(100000),
}).strict();
export const deliveryOverridesSchema = deliverySettingsSchema.partial();
export type DeliverySettings = z.infer<typeof deliverySettingsSchema>;
export type DeliveryOverrides = z.infer<typeof deliveryOverridesSchema>;
export function defaultDeliverySettings(): DeliverySettings {
  return { enabled: false, providerId: null, timezone: 'Europe/Copenhagen', paused: false, pricingRules: null, scheduleMode: 'restaurant', pickupOpeningOffsetMinutes: 20, pickupClosingOffsetMinutes: 20, weeklyHours: Array.from({ length: 7 }, (_, day) => ({ day, intervals: [] })), exceptions: [], preparationMinutes: 20, maxTransportMinutes: 60, maxDistanceMeters: 10000 };
}
export function resolveDeliverySettings(brand: DeliverySettings, overrides: DeliveryOverrides) {
  const settings = deliverySettingsSchema.parse({ ...brand, ...overrides });
  return { settings, inheritedKeys: Object.keys(brand).filter(key => !Object.hasOwn(overrides, key)) as Array<keyof DeliverySettings> };
}
const revision = z.number().int().nonnegative().safe().max(Number.MAX_SAFE_INTEGER - 1);
export const settingsScopeSchema = z.object({ brandId: deliveryId, locationId: deliveryId.nullable() }).strict();
export const settingsCommandSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('brand'), brandId: deliveryId, locationId: z.null(), expectedRevision: revision, settings: deliverySettingsSchema }).strict(),
  z.object({ scope: z.literal('location'), brandId: deliveryId, locationId: deliveryId, expectedRevision: revision, expectedBrandRevision: revision, overrides: deliveryOverridesSchema }).strict(),
]);
export const deliverySettingsResponseSchema = settingsScopeSchema.extend({
  brandRevision: z.number().int().nonnegative().safe(), revision: z.number().int().nonnegative().safe(),
  settings: deliverySettingsSchema, brandSettings: deliverySettingsSchema, overrides: deliveryOverridesSchema,
  inheritedKeys: z.array(deliverySettingsSchema.keyof()), editable: z.boolean(),
}).strict();
export type DeliverySettingsResponse = z.infer<typeof deliverySettingsResponseSchema>;
