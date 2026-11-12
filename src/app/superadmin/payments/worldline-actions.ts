'use server';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { getAdminDb } from '@/lib/firebase-admin';
import { worldlineInputSchema, worldlineScopeSchema, mergeWorldlineCredentials, validateWorldlineCredentials, type WorldlineScope, type WorldlineSettingsRecord } from '@/lib/payments/worldline-settings';
import { readWorldlineSecret, writeWorldlineSecret, worldlineSettingsRef } from '@/lib/payments/worldline-store';
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
  const row = (await worldlineSettingsRef(scope).get()).data() as WorldlineSettingsRecord | undefined;
  const brand = scope.locationId ? (await worldlineSettingsRef({ brandId: scope.brandId }).get()).data() as WorldlineSettingsRecord | undefined : row;
  return { source: row?.source || (scope.locationId ? 'brand' as const : 'own' as const), mode: row?.mode || 'disabled' as const,
    provider: row?.provider || 'stripe' as const, brandProvider: brand?.provider || 'stripe' as const, revision: row?.revision || 0, testSet: !!row?.test, liveSet: !!row?.live, brandMode: brand?.mode || 'disabled' as const };
}
export async function saveWorldlineSettings(scopeInput: WorldlineScope, input: unknown) {
  const scope = await authorize(scopeInput), parsed = worldlineInputSchema.parse(input);
  if (!scope.locationId && parsed.source !== 'own') throw new Error('Brandet skal bruge egen aftale.');
  const ref = worldlineSettingsRef(scope);
  const previous = (await ref.get()).data() as WorldlineSettingsRecord | undefined;
  if ((previous?.revision || 0) !== parsed.revision) throw new Error('Indstillingerne er ændret. Genindlæs siden.');
  const next: WorldlineSettingsRecord = { source: parsed.source, provider: parsed.provider, mode: parsed.mode, revision: parsed.revision + 1 };
  try {
    for (const mode of ['test', 'live'] as const) {
      if (previous?.[mode]) next[mode] = previous[mode];
      const changed = Object.values(parsed[mode]).some(Boolean);
      if (parsed.source === 'own' && (changed || parsed.mode === mode)) {
        const stored = previous?.[mode] ? await readWorldlineSecret(scope, mode, previous[mode]!) : undefined;
        const credentials = mergeWorldlineCredentials(parsed[mode], stored);
        validateWorldlineCredentials(credentials, mode);
        if (changed) next[mode] = await writeWorldlineSecret(scope, mode, credentials);
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
