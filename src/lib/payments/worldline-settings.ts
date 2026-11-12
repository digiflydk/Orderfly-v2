import { z } from 'zod';
export const worldlineScopeSchema = z.object({ brandId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), locationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional() }).strict();
export type WorldlineScope = z.infer<typeof worldlineScopeSchema>;
export type WorldlineMode = 'disabled' | 'test' | 'live';
const credential = z.string().trim().max(512).refine(value => !/[\s\p{Cc}]/u.test(value));
export const worldlineCredentialsSchema = z.object({ merchantNumber: credential, accessToken: credential, secretToken: credential, md5Key: credential }).strict();
export type WorldlineCredentials = z.infer<typeof worldlineCredentialsSchema>;
export const worldlineInputSchema = z.object({ source: z.enum(['own', 'brand']), mode: z.enum(['disabled', 'test', 'live']), test: worldlineCredentialsSchema, live: worldlineCredentialsSchema, revision: z.number().int().nonnegative() }).strict();
export type WorldlineInput = z.infer<typeof worldlineInputSchema>;
export function mergeWorldlineCredentials(input: WorldlineCredentials, stored?: WorldlineCredentials): WorldlineCredentials {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, value || stored?.[key as keyof WorldlineCredentials] || ''])) as WorldlineCredentials;
}
export function validateWorldlineCredentials(credentials: WorldlineCredentials, mode: 'test' | 'live') {
  if (Object.values(credentials).some(value => !value)) throw new Error('Alle fire nøglefelter skal udfyldes for det valgte miljø.');
  if (!credentials.merchantNumber.startsWith(mode === 'test' ? 'T' : 'P')) throw new Error('Merchant Number skal begynde med T for test og P for live.');
}
export type WorldlineSettingsRecord = { source: 'own' | 'brand'; mode: WorldlineMode; test?: string; live?: string; revision: number };
export function selectWorldlineAgreement(brand: WorldlineSettingsRecord | null, location?: WorldlineSettingsRecord | null) {
  // An own agreement is indivisible: never fall back to brand credentials.
  return location?.source === 'own' ? location : brand;
}
