import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { worldlineScopeSchema, selectWorldlineAgreement, validateStripeCredentials, type WorldlineScope, type WorldlineSettingsRecord } from './worldline-settings';
import { worldlineSettingsRef, readStripeSecret, resolveWorldlineAgreement } from './worldline-store';

export const stripeBindingSchema = z.object({ provider: z.literal('stripe'), mode: z.enum(['test','live']), owner: worldlineScopeSchema,
  reference: z.string(), revision: z.number().int().positive() }).strict();
export type StripeBinding = z.infer<typeof stripeBindingSchema>;
/** null means no merchant configuration exists. An explicit incomplete/disabled agreement never falls back. */
export async function resolveMerchantAgreement(input: WorldlineScope) {
  const scope = worldlineScopeSchema.parse(input);
  const db = getAdminDb();
  const brand = await db.collection('brands').doc(scope.brandId).get();
  if (!brand.exists) throw new Error('Brand findes ikke.');
  if (scope.locationId) {
    const location = await db.collection('locations').doc(scope.locationId).get();
    if (!location.exists || location.data()?.brandId !== scope.brandId) throw new Error('Ugyldig lokation.');
  }
  const brandSettings = (await worldlineSettingsRef({brandId:scope.brandId}).get()).data() as WorldlineSettingsRecord | undefined;
  const locationSettings = scope.locationId ? (await worldlineSettingsRef(scope).get()).data() as WorldlineSettingsRecord | undefined : undefined;
  const selected = selectWorldlineAgreement(brandSettings || null, locationSettings);
  if (!selected) {if(locationSettings)throw new Error('Brandets betalingsaftale mangler.');return null;}
  if (selected.mode === 'disabled') throw new Error('Betalingsaftalen er deaktiveret.');
  if (selected.provider === 'worldline') return resolveWorldlineAgreement(scope);
  const owner = locationSettings?.source === 'own' ? scope : {brandId:scope.brandId};
  const reference = selected.mode === 'test' ? selected.stripeTest : selected.stripeLive;
  if (!reference) throw new Error('Stripe-aftalen mangler nøgler.');
  const binding = stripeBindingSchema.parse({provider:'stripe',mode:selected.mode,owner,reference,revision:selected.revision});
  const credentials = await readStripeSecret(owner, binding.mode, reference);
  validateStripeCredentials(credentials,binding.mode);
  return {provider:'stripe' as const,binding,credentials};
}
export async function readPinnedStripeAgreement(input: unknown) {
  const binding = stripeBindingSchema.parse(input);
  const credentials = await readStripeSecret(binding.owner,binding.mode,binding.reference);
  validateStripeCredentials(credentials,binding.mode);
  return {binding,credentials};
}
