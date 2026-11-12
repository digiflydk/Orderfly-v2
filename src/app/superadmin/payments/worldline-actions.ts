'use server';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { getAdminDb } from '@/lib/firebase-admin';
import { worldlineInputSchema, worldlineScopeSchema, mergeWorldlineCredentials, validateWorldlineCredentials, validateStripeCredentials, worldlineSettingsRecordSchema, type WorldlineScope, type WorldlineSettingsRecord } from '@/lib/payments/worldline-settings';
import { readWorldlineSecret, writeWorldlineSecret, worldlineSettingsRef, readStripeSecret, writeStripeSecret } from '@/lib/payments/worldline-store';
async function authorize(input: unknown) {
  await requirePlatformSuperuser();
  const scope = worldlineScopeSchema.parse(input);
  if (!(await getAdminDb().collection('brands').doc(scope.brandId).get()).exists) throw new Error('Brand findes ikke.');
  if (scope.locationId) {
    const row = await getAdminDb().collection('locations').doc(scope.locationId).get();
    if (!row.exists || row.data()?.brandId !== scope.brandId) throw new Error('Lokationen tilhører ikke brandet.');
  }
  return scope;
}
export async function loadWorldlineSettings(input: WorldlineScope) {
  const scope = await authorize(input);
  const rowData = (await worldlineSettingsRef(scope).get()).data();
  const brandData = scope.locationId ? (await worldlineSettingsRef({ brandId: scope.brandId }).get()).data() : rowData;
  const row = rowData ? worldlineSettingsRecordSchema.parse(rowData) : undefined;
  const brand = brandData ? worldlineSettingsRecordSchema.parse(brandData) : undefined;
  if (brand && brand.source !== 'own') throw new Error('Brandets betalingsaftale er ugyldig.');
  const selected = row?.source === 'own' ? row : brand;
  const legacy = !selected && !row;
  const globalSettings = legacy ? (await getAdminDb().collection('platform_settings').doc('payment_gateway').get()).data() : undefined;
  const globalMode = globalSettings?.activeMode;
  const globalKeysSet = (globalMode === 'test' || globalMode === 'live') && ['secretKey', 'publishableKey', 'webhookSecret'].every(field => typeof globalSettings?.[globalMode]?.[field] === 'string' && !!globalSettings[globalMode][field]);
  const effectiveMode: 'disabled' | 'test' | 'live' = selected?.mode || (globalMode === 'test' || globalMode === 'live' ? globalMode : 'disabled');
  const effectiveProvider = selected?.provider || 'stripe';
  const credentialField = effectiveProvider === 'worldline' ? effectiveMode : effectiveMode === 'test' ? 'stripeTest' : 'stripeLive';
  const effective = {
    source: legacy ? 'platform' as const : row?.source === 'own' && scope.locationId ? 'location' as const : 'brand' as const,
    provider: effectiveProvider, mode: effectiveMode, legacy,
    configured: !!selected || legacy && effectiveMode !== 'disabled',
    credentialsSet: legacy ? globalKeysSet : effectiveMode !== 'disabled' && !!selected?.[credentialField as 'test' | 'live' | 'stripeTest' | 'stripeLive'],
  };
  return { effective, source: row?.source || (scope.locationId ? 'brand' as const : 'own' as const), mode: row?.mode || 'disabled' as const,
    provider: row?.provider || 'stripe' as const, brandProvider: brand?.provider || 'stripe' as const, revision: row?.revision || 0, testSet: !!row?.test, liveSet: !!row?.live, stripeTestSet: !!row?.stripeTest, stripeLiveSet: !!row?.stripeLive, brandMode: brand?.mode || 'disabled' as const };
}
export async function saveWorldlineSettings(scopeInput: WorldlineScope, input: unknown) {
  const scope = await authorize(scopeInput), validated = worldlineInputSchema.safeParse(input);
  if (!validated.success) throw new Error('Kontrollér betalingsopsætningens felter og miljø.');
  const parsed = validated.data;
  if (!scope.locationId && parsed.source !== 'own') throw new Error('Brandet skal bruge egen aftale.');
  if (scope.locationId && parsed.source === 'brand' && !(await worldlineSettingsRef({ brandId: scope.brandId }).get()).exists) throw new Error('Opret brandets betalingsaftale, før lokationen gemmes med arv fra brandet.');
  const ref = worldlineSettingsRef(scope);
  const previousData = (await ref.get()).data();
  const previous = previousData ? worldlineSettingsRecordSchema.parse(previousData) : undefined;
  if ((previous?.revision || 0) !== parsed.revision) throw new Error('Indstillingerne er ændret. Genindlæs siden.');
  const next: WorldlineSettingsRecord = { source: parsed.source, provider: parsed.provider, mode: parsed.mode, revision: parsed.revision + 1 };
  try {
    for (const mode of ['test', 'live'] as const) {
      if (previous?.[mode]) next[mode] = previous[mode];
      const changed = Object.values(parsed[mode]).some(Boolean);
      if (parsed.source === 'own' && (changed || parsed.provider === 'worldline' && parsed.mode === mode)) {
        const stored = previous?.[mode] ? await readWorldlineSecret(scope, mode, previous[mode]!) : undefined;
        if (stored && parsed[mode].merchantNumber && parsed[mode].merchantNumber !== stored.merchantNumber && Object.values(parsed[mode]).some(value => !value)) throw new Error('Et nyt Merchant Number kræver alle nye nøgler.');
        const credentials = mergeWorldlineCredentials(parsed[mode], stored);
        validateWorldlineCredentials(credentials, mode);
        if (changed) next[mode] = await writeWorldlineSecret(scope, mode, credentials);
      }
      const field = mode === 'test' ? 'stripeTest' : 'stripeLive';
      if (previous?.[field]) next[field] = previous[field];
      const stripeChanged = Object.values(parsed[field]).some(Boolean);
      if (parsed.source === 'own' && (stripeChanged || parsed.provider === 'stripe' && parsed.mode === mode)) {
        const old = previous?.[field] ? await readStripeSecret(scope, mode, previous[field]!) : undefined;
        const keys = { secretKey: parsed[field].secretKey || old?.secretKey || '', publishableKey: parsed[field].publishableKey || old?.publishableKey || '', webhookSecret: parsed[field].webhookSecret || old?.webhookSecret || '' };
        validateStripeCredentials(keys, mode);
        if (stripeChanged) next[field] = await writeStripeSecret(scope, mode, keys);
      }
    }
  } catch { throw new Error('Nøglerne kunne ikke gemmes eller valideres. Kontrollér alle felter, T/P-nummer og Secret Manager-adgang.'); }
  if (parsed.source === 'brand') next.mode = 'disabled';
  await getAdminDb().runTransaction(async tx => {
    const current = await tx.get(ref);
    if ((current.data()?.revision || 0) !== parsed.revision) throw new Error('Indstillingerne er ændret. Genindlæs siden.');
    tx.set(ref, { ...next, updatedAt: Date.now() });
  });
  return loadWorldlineSettings(scope);
}
