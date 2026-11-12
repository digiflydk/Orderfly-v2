import { z } from 'zod';
export const worldlineScopeSchema = z.object({ brandId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), locationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional() }).strict();
export type WorldlineScope = z.infer<typeof worldlineScopeSchema>;
export type WorldlineMode = 'disabled' | 'test' | 'live';
const credential = z.string().trim().max(512).refine(value => !/[\s\p{Cc}]/u.test(value));
export const worldlineCredentialsSchema = z.object({ merchantNumber: credential, accessToken: credential, secretToken: credential, md5Key: credential }).strict();
export type WorldlineCredentials = z.infer<typeof worldlineCredentialsSchema>;
export const stripeCredentialsSchema = z.object({ secretKey: credential, publishableKey: credential, webhookSecret: credential }).strict();
export type StripeCredentials = z.infer<typeof stripeCredentialsSchema>;
const emptyStripe = { secretKey: '', publishableKey: '', webhookSecret: '' };
export function validateStripeCredentials(keys: StripeCredentials, mode: 'test' | 'live') {
  if (!new RegExp(`^sk_${mode}_[A-Za-z0-9]+$`).test(keys.secretKey) || !new RegExp(`^pk_${mode}_[A-Za-z0-9]+$`).test(keys.publishableKey) || !/^whsec_[A-Za-z0-9]+$/.test(keys.webhookSecret)) throw new Error('Ugyldige Stripe-nøgler for miljøet.');
}
export const worldlineInputSchema = z.object({ source: z.enum(['own', 'brand']), provider: z.enum(['stripe', 'worldline']).default('stripe'), mode: z.enum(['disabled', 'test', 'live']), test: worldlineCredentialsSchema, live: worldlineCredentialsSchema, stripeTest: stripeCredentialsSchema.default(emptyStripe), stripeLive: stripeCredentialsSchema.default(emptyStripe), revision: z.number().int().nonnegative() }).strict();
export type WorldlineInput = z.infer<typeof worldlineInputSchema>;
export function mergeWorldlineCredentials(input: WorldlineCredentials, stored?: WorldlineCredentials): WorldlineCredentials {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value || stored?.[key as keyof WorldlineCredentials] || ''])) as WorldlineCredentials;
}
export function validateWorldlineCredentials(credentials: WorldlineCredentials, mode: 'test' | 'live') {
  if (Object.values(credentials).some(value => !value)) throw new Error('Alle fire nøglefelter skal udfyldes for det valgte miljø.');
  if (!credentials.merchantNumber.startsWith(mode === 'test' ? 'T' : 'P')) throw new Error('Merchant Number skal begynde med T for test og P for live.');
}
export const worldlineSettingsRecordSchema = z.object({
  source: z.enum(['own', 'brand']), provider: z.enum(['stripe', 'worldline']).optional(),
  mode: z.enum(['disabled', 'test', 'live']), revision: z.number().int().positive(),
  test: z.string().optional(), live: z.string().optional(),
  stripeTest: z.string().optional(), stripeLive: z.string().optional(),
}).passthrough();
export type WorldlineSettingsRecord = z.infer<typeof worldlineSettingsRecordSchema>;
export function selectWorldlineAgreement(brand: WorldlineSettingsRecord | null, location?: WorldlineSettingsRecord | null) {
  // An own agreement is indivisible: never fall back to brand credentials.
  return location?.source === 'own' ? location : brand;
}
