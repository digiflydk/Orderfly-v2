'use server';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { parseWorldlineApiKey } from '@/lib/payments/worldline-api-key';
import { getAdminDb } from '@/lib/firebase-admin';
import { worldlineInputSchema, worldlineScopeSchema, mergeWorldlineCredentials, validateWorldlineCredentials, validateStripeCredentials, worldlineSettingsRecordSchema, type WorldlineScope, type WorldlineSettingsRecord } from '@/lib/payments/worldline-settings';
import { readWorldlineSecret, writeWorldlineSecret, worldlineSettingsRef, readStripeSecret, writeStripeSecret } from '@/lib/payments/worldline-store';
async function authorize(input: unknown) {
  await requirePlatformSuperuser();
  const parsed = worldlineScopeSchema.safeParse(input);
  if (!parsed.success) throw new PaymentSettingsError('INVALID_SCOPE', 'Brand og lokation kunne ikke valideres. Genindlæs siden.');
  const scope = parsed.data;
  if (!(await getAdminDb().collection('brands').doc(scope.brandId).get()).exists) throw new PaymentSettingsError('INVALID_SCOPE', 'Brandet findes ikke. Genindlæs siden.');
  if (scope.locationId) {
    const row = await getAdminDb().collection('locations').doc(scope.locationId).get();
    if (!row.exists || row.data()?.brandId !== scope.brandId) throw new PaymentSettingsError('INVALID_SCOPE', 'Lokationen tilhører ikke det valgte brand. Genindlæs siden.');
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
type SettingsView = Awaited<ReturnType<typeof loadWorldlineSettings>>;
export type WorldlineSaveResult = { ok: true; settings: SettingsView } | { ok: false; code: string; message: string; field?: string };
class PaymentSettingsError extends Error {
  constructor(readonly code: string, message: string, readonly field?: string) { super(message); }
}
type SaveStage = 'authority' | 'settings' | 'secret-read' | 'secret-write' | 'commit' | 'refresh';
const failure = (code: string, message: string, field?: string): WorldlineSaveResult => ({ ok: false, code, message, ...(field ? { field } : {}) });
function errorCode(error: unknown): unknown {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}
function errorStatus(error: unknown): unknown {
  return error && typeof error === 'object' && 'status' in error ? error.status : undefined;
}
function saveFailure(error: unknown, stage: SaveStage): WorldlineSaveResult {
  if (error instanceof PaymentSettingsError) return failure(error.code, error.message, error.field);
  const code = errorCode(error), status = errorStatus(error);
  if (stage === 'authority') {
    if ([401, 403].includes(Number(status)) || ['forbidden', 'unauthorized'].includes(String(code))) return failure('FORBIDDEN', 'Betalingsopsætningen kræver platformadministratoradgang. Log ind igen eller kontakt en administrator.');
    return failure('AUTH_UNAVAILABLE', 'Din administratoradgang kunne ikke bekræftes. Genindlæs siden og prøv igen.');
  }
  if (stage === 'secret-read' || stage === 'secret-write') {
    if ([7, 403, 'PERMISSION_DENIED'].includes(code as number | string)) return failure('KEY_STORAGE_PERMISSION_DENIED', 'Serveren mangler adgang til nøglelageret. Kontakt en administrator; indtast ikke nye betalingsnøgler for at løse adgangsfejlen.');
    if ([16, 401, 'UNAUTHENTICATED'].includes(code as number | string)) return failure('KEY_STORAGE_AUTH_FAILED', 'Serverens adgang til nøglelageret kunne ikke bekræftes. Kontakt en administrator.');
    return failure('KEY_STORAGE_UNAVAILABLE', 'Nøglelageret er ikke tilgængeligt, eller den gemte nøglereference kan ikke læses. Kontakt en administrator og prøv igen, når adgangen er rettet.');
  }
  if (stage === 'refresh') return failure('SAVED_RELOAD_REQUIRED', 'Betalingsopsætningen blev gemt, men visningen kunne ikke opdateres. Genindlæs siden, før du gemmer igen.');
  if (stage === 'commit') {
    if ([7, 403, 'PERMISSION_DENIED'].includes(code as number | string)) return failure('SETTINGS_WRITE_DENIED', 'Serveren mangler adgang til at gemme betalingsopsætningen. Kontakt en administrator.');
    if ([10, 'ABORTED'].includes(code as number | string)) return failure('REVISION_CONFLICT', 'Indstillingerne er ændret. Genindlæs siden, før du gemmer igen.');
    return failure('SAVE_STATUS_UNKNOWN', 'Det kunne ikke bekræftes, om betalingsopsætningen blev gemt. Genindlæs siden og kontrollér den gemte aftale, før du prøver igen.');
  }
  return failure('SETTINGS_UNAVAILABLE', 'Betalingsopsætningen kunne ikke indlæses. Genindlæs siden eller kontakt en administrator.');
}
/** Expected save failures are data, not thrown Server Action errors: Next masks thrown messages in production. */
export async function saveWorldlineSettings(scopeInput: WorldlineScope, input: unknown): Promise<WorldlineSaveResult> {
  let stage: SaveStage = 'authority';
  try {
    const scope = await authorize(scopeInput);
    stage = 'settings';
    const validated = worldlineInputSchema.safeParse(input);
    if (!validated.success) return failure('INVALID_INPUT', 'Kontrollér betalingsopsætningens felter og miljø.');
    const parsed = validated.data;
    if (!scope.locationId && parsed.source !== 'own') return failure('INVALID_SCOPE', 'Brandet skal bruge egen aftale.');
    if (scope.locationId && parsed.source === 'brand' && !(await worldlineSettingsRef({ brandId: scope.brandId }).get()).exists) return failure('MISSING_BRAND_AGREEMENT', 'Opret brandets betalingsaftale, før lokationen gemmes med arv fra brandet.');
    const ref = worldlineSettingsRef(scope), previousData = (await ref.get()).data();
    const storedSettings = previousData ? worldlineSettingsRecordSchema.safeParse(previousData) : null;
    if (storedSettings && !storedSettings.success) return failure('SETTINGS_UNAVAILABLE', 'Den gemte betalingsopsætning kunne ikke valideres. Kontakt en administrator.');
    const previous = storedSettings?.success ? storedSettings.data : undefined;
    if ((previous?.revision || 0) !== parsed.revision) return failure('REVISION_CONFLICT', 'Indstillingerne er ændret. Genindlæs siden, før du gemmer igen.');
    const next: WorldlineSettingsRecord = { source: parsed.source, provider: parsed.provider, mode: parsed.mode, revision: parsed.revision + 1 };
    // Parse every supplied API code before touching Secret Manager. Never combine
    // a decoded API tuple with individual authentication fields from another account.
    const apiAuth: Partial<Record<'test' | 'live', ReturnType<typeof parseWorldlineApiKey>>> = {};
    for (const mode of ['test', 'live'] as const) {
      const field = mode === 'test' ? 'testApiKey' : 'liveApiKey', value = parsed[field];
      if (!value) continue;
      if (parsed[mode].merchantNumber || parsed[mode].accessToken || parsed[mode].secretToken) return failure('INVALID_API_KEY', 'Brug enten den samlede API-kode eller de separate adgangsfelter, ikke begge dele.', field);
      try { apiAuth[mode] = parseWorldlineApiKey(value, mode); }
      catch (error) {
        return errorCode(error) === 'api_key_environment_mismatch'
          ? failure('WORLDLINE_ENVIRONMENT_MISMATCH', 'API-kodens Merchant Number passer ikke til det valgte test-/live-miljø.', field)
          : failure('INVALID_API_KEY', 'API-koden kunne ikke læses. Brug den komplette API-kode fra Worldline, eller vælg de separate adgangsfelter.', field);
      }
    }
    for (const mode of ['test', 'live'] as const) {
      if (previous?.[mode]) next[mode] = previous[mode];
      const auth = apiAuth[mode], changed = !!auth || Object.values(parsed[mode]).some(Boolean);
      if (parsed.source === 'own' && (changed || parsed.provider === 'worldline' && parsed.mode === mode)) {
        stage = 'secret-read';
        const stored = previous?.[mode] ? await readWorldlineSecret(scope, mode, previous[mode]!) : undefined;
        let credentials = mergeWorldlineCredentials(parsed[mode], stored);
        if (auth) credentials = { ...auth, md5Key: parsed[mode].md5Key || (stored?.merchantNumber === auth.merchantNumber ? stored.md5Key : '') };
        if (!credentials.md5Key) return failure('WORLDLINE_MD5_REQUIRED', 'MD5-nøglen til callbackkontrol mangler. Den er separat fra API-koden og skal indtastes fra Worldlines Merchant Number-indstillinger.', `${mode}.md5Key`);
        if (stored && credentials.merchantNumber !== stored.merchantNumber) {
          if (!parsed[mode].md5Key) return failure('WORLDLINE_MD5_REQUIRED', 'Et nyt Merchant Number kræver MD5-nøglen til den nye aftale. Den gamle MD5-nøgle genbruges ikke.', `${mode}.md5Key`);
          if (!auth && Object.values(parsed[mode]).some(value => !value)) return failure('MERCHANT_REPLACEMENT_REQUIRED', 'Et nyt Merchant Number kræver alle nye adgangsfelter og MD5-nøglen.', `${mode}.merchantNumber`);
        }
        if (!credentials.merchantNumber || !credentials.accessToken || !credentials.secretToken) return failure('WORLDLINE_CREDENTIALS_REQUIRED', 'Worldline-adgangen er ufuldstændig. Angiv en samlet API-kode eller alle tre separate adgangsfelter.', `${mode}.merchantNumber`);
        if (!credentials.merchantNumber.startsWith(mode === 'test' ? 'T' : 'P')) return failure('WORLDLINE_ENVIRONMENT_MISMATCH', 'Merchant Number skal begynde med T for test og P for live.', `${mode}.merchantNumber`);
        try { validateWorldlineCredentials(credentials, mode); } catch { return failure('WORLDLINE_CREDENTIALS_REQUIRED', 'Kontrollér Worldline-adgangen og MD5-nøglen for det valgte miljø.'); }
        if (changed) { stage = 'secret-write'; next[mode] = await writeWorldlineSecret(scope, mode, credentials); }
      }
      const stripeField = mode === 'test' ? 'stripeTest' : 'stripeLive';
      if (previous?.[stripeField]) next[stripeField] = previous[stripeField];
      const stripeChanged = Object.values(parsed[stripeField]).some(Boolean);
      if (parsed.source === 'own' && (stripeChanged || parsed.provider === 'stripe' && parsed.mode === mode)) {
        stage = 'secret-read';
        const old = previous?.[stripeField] ? await readStripeSecret(scope, mode, previous[stripeField]!) : undefined;
        const keys = { secretKey: parsed[stripeField].secretKey || old?.secretKey || '', publishableKey: parsed[stripeField].publishableKey || old?.publishableKey || '', webhookSecret: parsed[stripeField].webhookSecret || old?.webhookSecret || '' };
        try { validateStripeCredentials(keys, mode); } catch { return failure('STRIPE_CREDENTIALS_INVALID', 'Stripe-nøglerne mangler eller passer ikke til det valgte test-/live-miljø.', stripeField); }
        if (stripeChanged) { stage = 'secret-write'; next[stripeField] = await writeStripeSecret(scope, mode, keys); }
      }
    }
    if (parsed.source === 'brand') next.mode = 'disabled';
    stage = 'commit';
    await getAdminDb().runTransaction(async tx => {
      const current = await tx.get(ref);
      if ((current.data()?.revision || 0) !== parsed.revision) throw new PaymentSettingsError('REVISION_CONFLICT', 'Indstillingerne er ændret. Genindlæs siden, før du gemmer igen.');
      tx.set(ref, { ...next, updatedAt: Date.now() });
    });
    stage = 'refresh';
    return { ok: true, settings: await loadWorldlineSettings(scope) };
  } catch (error) { return saveFailure(error, stage); }
}
