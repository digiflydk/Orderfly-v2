import 'server-only';
import { z } from 'zod';
import {isDeepStrictEqual} from 'node:util';
import { getAdminDb } from '@/lib/firebase-admin';
import { worldlineScopeSchema, worldlineSettingsRecordSchema, selectWorldlineAgreement, validateStripeCredentials, stripeCredentialsSchema, type WorldlineScope, type WorldlineSettingsRecord } from './worldline-settings';
import { worldlineSettingsRef, readStripeSecret, resolveWorldlineAgreement } from './worldline-store';

export const stripeBindingSchema = z.object({ provider: z.literal('stripe'), mode: z.enum(['test','live']), owner: worldlineScopeSchema,
  reference: z.string().regex(/^(projects\/[a-z][a-z0-9-]{4,62}\/secrets\/orderfly-stripe-[a-f0-9]{64}-(test|live)\/versions\/[1-9][0-9]*|platform_settings\/stripe-legacy-[a-f0-9]{64})$/), revision: z.number().int().positive() }).strict().superRefine((value, context) => {
    if (!value.reference.startsWith('platform_settings/stripe-legacy-') && !value.reference.includes(`-${value.mode}/versions/`)) context.addIssue({code:'custom',message:'Stripe payment environment mismatch'});
  });
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
  const rawBrand = (await worldlineSettingsRef({brandId:scope.brandId}).get()).data();
  const rawLocation = scope.locationId ? (await worldlineSettingsRef(scope).get()).data() : undefined;
  const brandSettings = rawBrand ? worldlineSettingsRecordSchema.parse(rawBrand) : undefined;
  const locationSettings = rawLocation ? worldlineSettingsRecordSchema.parse(rawLocation) : undefined;
  if (brandSettings && brandSettings.source !== 'own') throw new Error('Brandets betalingsaftale er ugyldig.');
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
  if (binding.reference.startsWith('platform_settings/stripe-legacy-')) {
    const data = (await getAdminDb().collection('platform_settings').doc(binding.reference.split('/')[1]).get()).data();
    const credentials = data?.credentials ? stripeCredentialsSchema.parse(data.credentials) : null;
    if (data?.kind !== 'legacyStripeAgreement' || data?.mode !== binding.mode || !credentials
      || JSON.stringify(worldlineScopeSchema.parse(data.owner)) !== JSON.stringify(binding.owner)) throw new Error('Invalid legacy Stripe archive');
    validateLegacyStripeCredentials(credentials, binding.mode);
    const {createHash} = await import('node:crypto');
    const digest = createHash('sha256').update(JSON.stringify([binding.owner.brandId, binding.owner.locationId ?? null, binding.mode, credentials.secretKey, credentials.publishableKey, credentials.webhookSecret])).digest('hex');
    if (data.digest !== digest || binding.reference !== `platform_settings/stripe-legacy-${digest}` || binding.revision !== 1) throw new Error('Invalid legacy Stripe archive');
    return {binding,credentials};
  }
  const credentials = await readStripeSecret(binding.owner,binding.mode,binding.reference);
  validateStripeCredentials(credentials,binding.mode);
  return {binding,credentials};
}

/** Legacy compatibility only: immutable archive in the same server-only storage as payment_gateway.
 * Scoped merchant agreements always stay in Secret Manager; never fall back to this archive.
 */
export async function resolveLegacyStripeAgreement(input: WorldlineScope, modeOverride?: 'test' | 'live') {
  const scope = worldlineScopeSchema.parse(input);
  const db = getAdminDb();
  const gateway = (await db.collection('platform_settings').doc('payment_gateway').get()).data();
  const mode = z.enum(['test', 'live']).parse(modeOverride ?? gateway?.activeMode);
  const value = gateway?.[mode];
  const credentials = {
    secretKey: typeof value?.secretKey === 'string' ? value.secretKey : '',
    publishableKey: typeof value?.publishableKey === 'string' ? value.publishableKey : '',
    webhookSecret: typeof value?.webhookSecret === 'string' ? value.webhookSecret : '',
  };
  validateLegacyStripeCredentials(credentials, mode);
  const {createHash} = await import('node:crypto');
  const digest = createHash('sha256').update(JSON.stringify([scope.brandId, scope.locationId ?? null, mode, credentials.secretKey, credentials.publishableKey, credentials.webhookSecret])).digest('hex');
  const ref = db.collection('platform_settings').doc(`stripe-legacy-${digest}`);
  const record = {kind:'legacyStripeAgreement', owner:scope, mode, credentials, digest};
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    if (!existing.exists) transaction.create(ref, record);
    else if (!isDeepStrictEqual(existing.data(),record)) throw new Error('Legacy Stripe archive conflict');
  });
  const binding = stripeBindingSchema.parse({provider:'stripe', mode, owner:scope, reference:`platform_settings/${ref.id}`, revision:1});
  return {provider:'stripe' as const, binding, credentials};
}

function validateLegacyStripeCredentials(credentials: {secretKey:string;publishableKey:string;webhookSecret:string}, mode:'test'|'live') {
  if (!new RegExp(`^(sk|rk)_${mode}_[A-Za-z0-9]+$`).test(credentials.secretKey)
    || credentials.publishableKey && !new RegExp(`^pk_${mode}_[A-Za-z0-9]+$`).test(credentials.publishableKey)
    || credentials.webhookSecret && !/^whsec_[A-Za-z0-9]+$/.test(credentials.webhookSecret)) throw new Error('Legacy Stripe is not configured for the requested environment');
}
