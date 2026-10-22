// Fixed, read-only production checkpoint probe. Never runs the worker or prints its cursor/lease.
import { pathToFileURL } from 'node:url';

export const PROJECT = 'orderfly-39325';
const MAX_AGE_MS = 60 * 60 * 1000;
const FIELDS = ['schemaVersion', 'lease', 'leaseUntil', 'lastError', 'lastFinishedAt', 'lastResult'];
const integer = value => typeof value?.integerValue === 'string' && /^\d+$/.test(value.integerValue)
  && Number.isSafeInteger(Number(value.integerValue)) ? Number(value.integerValue) : null;
const isNull = value => value != null && Object.hasOwn(value, 'nullValue');
const blocked = reason => ({ state: 'blocked', reason, productionScanAcceptance: false });

export function inspectCheckpoint(document, now = Date.now()) {
  const f = document?.fields;
  if (!f || integer(f.schemaVersion) !== 1) return blocked('checkpoint_schema_invalid');
  if (!isNull(f.lease) || integer(f.leaseUntil) !== 0) return blocked('lease_not_released');
  if (!isNull(f.lastError)) return blocked('last_worker_error_or_unknown');
  const finished = integer(f.lastFinishedAt);
  if (finished === null || finished > now || now - finished > MAX_AGE_MS) return blocked('checkpoint_not_recent');
  const counters = f.lastResult?.mapValue?.fields;
  const safe = {};
  for (const name of ['scanned', 'deleted', 'skipped', 'errors', 'deletedEvents', 'deletedRateLimits']) {
    const value = integer(counters?.[name]);
    if (value === null) return blocked('worker_counters_invalid');
    safe[name] = value;
  }
  if (safe.errors !== 0) return blocked('worker_reported_errors');
  return { state: 'checkpoint_verified', schemaVersion: 1, leaseReleased: true,
    lastErrorNull: true, lastFinishedAt: finished, ageSeconds: Math.floor((now - finished) / 1000),
    counters: safe, productionScanAcceptance: false };
}

export async function probeCheckpoint({ accessToken, fetchImpl = fetch, now = Date.now() }) {
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents/qrMaintenance/retention-v1`);
  for (const field of FIELDS) url.searchParams.append('mask.fieldPaths', field);
  try {
    const response = await fetchImpl(url.href, { method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) return blocked(response.status === 404 ? 'checkpoint_missing' : 'checkpoint_read_unavailable');
    return inspectCheckpoint(await response.json(), now);
  } catch { return blocked('checkpoint_read_unavailable'); }
}

async function main() {
  let result;
  try {
    if (process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      result = blocked('configured_production_read_credential_required');
    } else {
      const { default: admin } = await import('firebase-admin');
      const credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON));
      const token = await credential.getAccessToken();
      result = await probeCheckpoint({ accessToken: token.access_token });
    }
  } catch { result = blocked('configured_production_read_credential_unavailable'); }
  console.log(JSON.stringify({ project: PROJECT, checkpoint: 'qrMaintenance/retention-v1', ...result }));
  if (result.state !== 'checkpoint_verified') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
