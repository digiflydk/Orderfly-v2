'use strict';
// Invoked only by the existing QA0 seed/cleanup owner. Real API, auth and Admin
// I/O are never replaced in this proof. No credentials or raw records are logged.
const { Firestore } = require('@google-cloud/firestore');
const { randomBytes } = require('node:crypto');
const { PROJECT } = require('./environment.cjs');
const BASE = 'http://127.0.0.1:3100';
const marker = Symbol.for('orderfly.qa0.loopback-guard');
const fixedIds = Object.freeze({ brand: 'qa0-brand', foreignBrand: 'qa0-foreign-brand', location: 'qa0-location', foreignLocation: 'qa0-foreign-location', printer: 'qa0-printer' });
const fail = code => { throw Error('QA504 ' + code); };
const check = (value, code) => { if (!value) fail(code); };
function assertRuntime() {
  const expected = { ORDERFLY_LOCAL_QA: 'true', NEXT_PUBLIC_ORDERFLY_LOCAL_QA: 'true', GCLOUD_PROJECT: PROJECT,
    GOOGLE_CLOUD_PROJECT: PROJECT, NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT, SITE_URL: BASE,
    NEXT_PUBLIC_FIREBASE_API_KEY: 'qa0-public-only', NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: '127.0.0.1', NEXT_PUBLIC_FIREBASE_APP_ID: 'qa0-local',
    MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID: '00000000-0000-4000-8000-000000000001', MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000002',
    FIRESTORE_EMULATOR_HOST: '127.0.0.1:8088', FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
    QA0_CREDENTIAL_METADATA_PROOF: 'true', ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: 'false' };
  for (const [key, value] of Object.entries(expected)) check(process.env[key] === value, 'runtime-rejected');
  check(process.env.NODE_ENV === 'development' && Reflect.get(globalThis, marker) === true, 'runtime-rejected');
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('MPANEL_') && !Object.hasOwn(expected, key)) fail('runtime-rejected');
    if (/SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS|CLOUDSDK|GCE_METADATA|GOOGLE_METADATA|GOOGLE_OAUTH|GCLOUD_ACCESS_TOKEN|FIREBASE_TOKEN|FIREBASE_CONFIG|STRIPE|SMTP|RESEND|SENDGRID|OMNISEND|WOLT|UBER|GOOGLE_AUTH|(?:^|_)PROXY$/i.test(key)
      || /PRINT_(?:INTENTS|OUTPUT|DISPATCH)_ENABLED/.test(key)) fail('runtime-rejected');
  }
}
function own(input, names) {
  check(input && typeof input === 'object' && !Array.isArray(input)
    && [Object.prototype, null].includes(Object.getPrototypeOf(input)), 'resources-rejected');
  const keys = Reflect.ownKeys(input);
  check(keys.length === names.length && keys.every(key => typeof key === 'string' && names.includes(key)), 'resources-rejected');
  const output = Object.create(null);
  for (const name of names) {
    const d = Object.getOwnPropertyDescriptor(input, name);
    check(d && Object.hasOwn(d, 'value'), 'resources-rejected'); output[name] = d.value;
  }
  return output;
}
function inspectResources(input) {
  assertRuntime();
  try {
    const row = own(input, ['db', 'ids', 'adminCookie', 'merchantCookie', 'register']);
    const ids = own(row.ids, Object.keys(fixedIds));
    check(Object.keys(fixedIds).every(key => ids[key] === fixedIds[key]), 'scope-rejected');
    check(row.db instanceof Firestore && row.db.projectId === PROJECT && row.db.databaseId === '(default)'
      && row.db._settings?.servicePath === '127.0.0.1' && row.db._settings?.port === 8088 && row.db._settings?.ssl === false, 'database-rejected');
    check(typeof row.register === 'function' && ['adminCookie', 'merchantCookie'].every(key => typeof row[key] === 'string'
      && row[key].startsWith('__session=') && row[key].length > 10 && row[key].length < 8192 && !/[\r\n]/.test(row[key])), 'resources-rejected');
    return row;
  } catch { fail('resources-rejected'); }
}
const stamp = snapshot => snapshot.exists ? `${snapshot.updateTime.seconds}:${snapshot.updateTime.nanoseconds}` : null;
const resultKeys = ['activationAuthorized', 'brandId', 'credentialRevision', 'dispatchAuthorized', 'locationId', 'printerId', 'printerRevision', 'state'];
function exactMetadata(value, state, printerRevision, credentialRevision) {
  check(value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(resultKeys), 'dto-rejected');
  check(value.brandId === fixedIds.brand && value.locationId === fixedIds.location && value.printerId === fixedIds.printer
    && value.state === state && value.printerRevision === printerRevision && value.credentialRevision === credentialRevision
    && value.activationAuthorized === false && value.dispatchAuthorized === false, 'metadata-mismatch');
}
async function runCredentialMetadataProof(input) {
  const r = inspectResources(input), { db, ids } = r;
  const printerPath = `locations/${ids.location}/printers/${ids.printer}`;
  const credentialPath = printerPath + '/deviceCredentials/current';
  check(await r.register(credentialPath) === true, 'cleanup-registration-rejected');
  const printerRef = db.doc(printerPath), credentialRef = db.doc(credentialPath);
  const initial = await printerRef.get();
  check(initial.exists && initial.data().revision === 1 && initial.data().configuration.state === 'disabled', 'seed-rejected');
  check(!(await credentialRef.get()).exists, 'refuse-existing-credential');
  const query = new URLSearchParams({ brandId: ids.brand, locationId: ids.location, printerId: ids.printer }).toString();
  const paths = [printerRef, credentialRef];
  let readOnlyReads = 0;
  async function request(suffix, cookie, status, expected, error) {
    assertRuntime();
    const before = await db.getAll(...paths);
    const response = await fetch(BASE + '/api/superadmin/printers/device-credentials' + suffix,
      { headers: cookie ? { cookie } : {}, signal: AbortSignal.timeout(15000) });
    check(response.status === status, 'http-status-' + status);
    check(response.headers.get('cache-control') === 'no-store'
      && (response.headers.get('vary') || '').split(',').some(v => v.trim().toLowerCase() === 'cookie'), 'private-cache-rejected');
    const text = await response.text();
    check(Buffer.byteLength(text) <= 2048, 'response-bound-rejected');
    const body = JSON.parse(text);
    if (expected) exactMetadata(body, ...expected);
    else check(JSON.stringify(Object.keys(body)) === '["error"]' && body.error === error, 'fixed-error-rejected');
    const after = await db.getAll(...paths);
    check(before.every((snapshot, i) => stamp(snapshot) === stamp(after[i])
      && JSON.stringify(snapshot.data()) === JSON.stringify(after[i].data())), 'get-mutated-native-data');
    readOnlyReads++;
  }
  const now = Date.now() - 1000;
  const credential = { schemaVersion: 1, brandId: ids.brand, locationId: ids.location, printerId: ids.printer,
    printerRevision: 1, credentialRevision: 7, secretDigest: randomBytes(32).toString('hex'), issuedAt: now, revokedAt: null };
  try {
    await request('?' + query, r.adminCookie, 200, ['missing', 1, 0]);
    await credentialRef.create(credential);
    await request('?' + query, r.adminCookie, 200, ['current', 1, 7]);
    await credentialRef.update({ credentialRevision: 8, revokedAt: now + 1 });
    await request('?' + query, r.adminCookie, 200, ['revoked', 1, 8]);
    await printerRef.update({ revision: 2 });
    await request('?' + query, r.adminCookie, 200, ['revoked', 2, 8]);
    await credentialRef.update({ revokedAt: null });
    await request('?' + query, r.adminCookie, 200, ['stale', 2, 8]);
    await credentialRef.update({ printerRevision: 2, credentialRevision: 9 });
    await request('?' + query, r.adminCookie, 200, ['current', 2, 9]);
    await request('?unknown=1', '', 401, null, 'unauthorized');
    await request('?' + query, '__session=invalid', 401, null, 'unauthorized');
    await request('?' + query, r.merchantCookie, 403, null, 'forbidden');
    await request('?' + new URLSearchParams({ brandId: ids.brand, locationId: ids.foreignLocation, printerId: ids.printer }), r.adminCookie, 403, null, 'forbidden');
    for (const suffix of ['&unknown=1', '&printerId=' + ids.printer, '&secret=must-not-reflect']) {
      await request('?' + query + suffix, r.adminCookie, 400, null, 'invalid_request');
    }
    await credentialRef.update({ printerRevision: 3 });
    await request('?' + query, r.adminCookie, 503, null, 'credentials_unavailable');
    await credentialRef.update({ printerRevision: 2, issuedAt: Date.now() + 60000 });
    await request('?' + query, r.adminCookie, 503, null, 'credentials_unavailable');
    await credentialRef.update({ issuedAt: now, brandId: ids.foreignBrand });
    await request('?' + query, r.adminCookie, 503, null, 'credentials_unavailable');
    await credentialRef.update({ brandId: ids.brand, secretDigest: 'malformed-private-value' });
    await request('?' + query, r.adminCookie, 503, null, 'credentials_unavailable');
    await credentialRef.delete();
    await request('?' + query, r.adminCookie, 200, ['missing', 2, 0]);
    return Object.freeze({ environment: 'QA504-native-metadata', stateCases: 7, readOnlyRequests: readOnlyReads,
      realSessions: true, realNativePersistence: true, missingCurrentRevokedStale: true, revokedPrecedence: true,
      authScopeAndStrictQuery: true, noPrivateDto: true, configWritesEnabled: false, outputEnabled: false,
      productionAcceptance: false, physicalPrintVerified: false });
  } finally {
    await credentialRef.delete();
    await printerRef.update({ revision: 1 });
  }
}
module.exports = { assertRuntime, inspectResources, exactMetadata, runCredentialMetadataProof };
