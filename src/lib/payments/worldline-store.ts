import 'server-only';
import { createHash } from 'node:crypto';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { worldlineCredentialsSchema, validateWorldlineCredentials, type WorldlineCredentials, type WorldlineScope, type WorldlineSettingsRecord, selectWorldlineAgreement, stripeCredentialsSchema, type StripeCredentials } from './worldline-settings';
let client: SecretManagerServiceClient | undefined;
const secretClient = () => client ??= new SecretManagerServiceClient();
export const worldlineSettingsId = (scope: WorldlineScope) => createHash('sha256').update(JSON.stringify([scope.brandId, scope.locationId || null])).digest('hex');
export const worldlineSettingsRef = (scope: WorldlineScope) => getAdminDb().collection('platform_settings').doc(`worldline-${worldlineSettingsId(scope)}`);
function name(scope: WorldlineScope, mode: 'test' | 'live') {
  const project = process.env.ORDERFLY_PAYMENT_SECRET_PROJECT || getAdminApp().options.projectId;
  if (!project || !/^[a-z][a-z0-9-]{4,62}$/.test(project)) throw new Error('Secret Manager er ikke konfigureret.');
  return `projects/${project}/secrets/orderfly-worldline-${worldlineSettingsId(scope)}-${mode}`;
}
export async function writeWorldlineSecret(scope: WorldlineScope, mode: 'test' | 'live', value: WorldlineCredentials) {
  const parent = name(scope, mode);
  try { await secretClient().createSecret({ parent: parent.split('/secrets/')[0], secretId: parent.split('/').at(-1), secret: { replication: { automatic: {} } } }); }
  catch (error) { if ((error as { code?: number }).code !== 6) throw error; }
  const [version] = await secretClient().addSecretVersion({ parent, payload: { data: Buffer.from(JSON.stringify(value)) } });
  const number = version.name?.split('/').at(-1);
  if (!number || !/^\d+$/.test(number)) throw new Error('Ugyldig nøglereference.');
  return `${parent}/versions/${number}`;
}
export async function readWorldlineSecret(scope: WorldlineScope, mode: 'test' | 'live', reference: string) {
  const prefix = `${name(scope, mode)}/versions/`;
  if (!reference.startsWith(prefix) || !/^[1-9][0-9]*$/.test(reference.slice(prefix.length))) throw new Error('Ugyldig nøglereference.');
  const [version] = await secretClient().accessSecretVersion({ name: reference });
  const bytes = version.payload?.data;
  const json = typeof bytes === 'string' ? Buffer.from(bytes, 'base64').toString() : Buffer.from(bytes || []).toString();
  return worldlineCredentialsSchema.parse(JSON.parse(json));
}
/** Internal only. Checkout must explicitly adopt this resolver in the payment integration. */
export async function resolveWorldlineAgreement(scope: WorldlineScope) {
  if (scope.locationId) {
    const location = await getAdminDb().collection('locations').doc(scope.locationId).get();
    if (!location.exists || location.data()?.brandId !== scope.brandId) throw new Error('Ugyldig lokation.');
  }
  const brand = (await worldlineSettingsRef({ brandId: scope.brandId }).get()).data() as WorldlineSettingsRecord | undefined;
  const location = scope.locationId ? (await worldlineSettingsRef(scope).get()).data() as WorldlineSettingsRecord | undefined : undefined;
  const selected = selectWorldlineAgreement(brand || null, location);
  if (!selected || (selected.provider || 'stripe') !== 'worldline') return null;
  if (selected.mode === 'disabled') throw new Error('Betalingsaftalen er deaktiveret.');
  const reference = selected[selected.mode];
  if (!reference) throw new Error('Betalingsaftalen mangler nøgler.');
  const owner = location?.source === 'own' ? scope : { brandId: scope.brandId };
  const credentials = await readWorldlineSecret(owner, selected.mode, reference);
  validateWorldlineCredentials(credentials, selected.mode);
  return { provider: 'worldline' as const, mode: selected.mode, owner, reference, merchantNumber: credentials.merchantNumber, revision: selected.revision, credentials };
}

export async function readPinnedWorldlineAgreement(input: unknown) {
  const { worldlineBindingSchema } = await import('./worldline-verification');
  const binding = worldlineBindingSchema.parse(input);
  const credentials = await readWorldlineSecret(binding.owner, binding.mode, binding.reference);
  validateWorldlineCredentials(credentials, binding.mode);
  if (credentials.merchantNumber !== binding.merchantNumber) throw new Error('Betalingsaftalen stemmer ikke.');
  return { binding, credentials };
}
function stripeName(scope: WorldlineScope, mode: 'test' | 'live') {
  return name(scope, mode).replace('/orderfly-worldline-', '/orderfly-stripe-');
}
export async function writeStripeSecret(scope: WorldlineScope, mode: 'test' | 'live', value: StripeCredentials) {
  const parent = stripeName(scope, mode);
  try { await secretClient().createSecret({ parent: parent.split('/secrets/')[0], secretId: parent.split('/').at(-1), secret: { replication: { automatic: {} } } }); }
  catch (error) { if ((error as { code?: number }).code !== 6) throw error; }
  const [version] = await secretClient().addSecretVersion({ parent, payload: { data: Buffer.from(JSON.stringify(value)) } });
  if (!version.name || !/^[1-9][0-9]*$/.test(version.name.split('/').at(-1)!)) throw new Error('Ugyldig nøglereference.');
  return version.name;
}
export async function readStripeSecret(scope: WorldlineScope, mode: 'test' | 'live', reference: string) {
  const prefix = `${stripeName(scope, mode)}/versions/`;
  if (!reference.startsWith(prefix) || !/^[1-9][0-9]*$/.test(reference.slice(prefix.length))) throw new Error('Ugyldig nøglereference.');
  const [version] = await secretClient().accessSecretVersion({ name: reference });
  const bytes = version.payload?.data;
  return stripeCredentialsSchema.parse(JSON.parse(typeof bytes === 'string' ? Buffer.from(bytes, 'base64').toString() : Buffer.from(bytes || []).toString()));
}
