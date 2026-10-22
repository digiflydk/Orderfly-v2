'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Firestore } = require('@google-cloud/firestore');
const { environment } = require('../../scripts/local-qa/environment.cjs');
const { assertRuntime, inspectResources, exactMetadata, runCredentialMetadataProof } = require('../../scripts/local-qa/credential-metadata-proof.cjs');
const marker = Symbol.for('orderfly.qa0.loopback-guard');
function guarded(run) {
  const before = process.env, descriptor = Object.getOwnPropertyDescriptor(globalThis, marker);
  process.env = { ...environment(), QA0_CREDENTIAL_METADATA_PROOF: 'true', ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: 'false' };
  Object.defineProperty(globalThis, marker, { value: true, configurable: true });
  try { return run(); } finally { process.env = before; if (descriptor) Object.defineProperty(globalThis, marker, descriptor); else delete globalThis[marker]; }
}
test('metadata proof rejects wrong/partial/production/provider/output runtime before native resources', () => guarded(() => {
  assert.doesNotThrow(assertRuntime);
  for (const patch of [{ QA0_CREDENTIAL_METADATA_PROOF: undefined }, { QA0_CREDENTIAL_METADATA_PROOF: 'false' },
    { ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: 'true' }, { GCLOUD_PROJECT: 'orderfly-39325' }, { SITE_URL: 'https://orderfly.dk' },
    { FIRESTORE_EMULATOR_HOST: 'remote:443' }, { NODE_ENV: 'production' }, { STRIPE_SECRET_KEY: '' }, { HTTP_PROXY: '' }, { MPANEL_PLATFORM_ADMIN_SECRET: '' },
    { NEXT_PUBLIC_FIREBASE_API_KEY: 'foreign' }, { ORDERFLY_PRINT_OUTPUT_ENABLED: 'false' }]) {
    const prior = process.env; process.env = { ...prior, ...patch };
    try { assert.throws(assertRuntime, /QA504 runtime-rejected/); } finally { process.env = prior; }
  }
}));
test('metadata resources reject forged SDK, foreign scope, accessors and malformed cookies before registration/I/O', () => guarded(() => {
  const resources = { db: {}, ids: { brand: 'qa0-brand', foreignBrand: 'qa0-foreign-brand', location: 'qa0-location', foreignLocation: 'qa0-foreign-location', printer: 'qa0-printer' },
    adminCookie: '__session=local-admin-fixture', merchantCookie: '__session=local-merchant-fixture', register() { assert.fail('no registration before resource validation'); } };
  assert.throws(() => inspectResources(resources), /QA504 resources-rejected/);
  const db = new Firestore({ projectId: 'demo-orderfly-qa0', host: '127.0.0.1:8088', ssl: false });
  try {
    assert.doesNotThrow(() => inspectResources({ ...resources, db }));
    assert.throws(() => inspectResources({ ...resources, db, ids: { ...resources.ids, printer: 'foreign' } }), /resources-rejected/);
    assert.throws(() => inspectResources({ ...resources, db, adminCookie: '__session=bad\r\nHeader' }), /resources-rejected/);
    const poison = { ...resources, db }; Object.defineProperty(poison, 'register', { get() { assert.fail('accessor must not run'); }, enumerable: true });
    assert.throws(() => inspectResources(poison), /resources-rejected/);
  } finally { void db.terminate(); }
}));
test('metadata response verifier rejects secret/digest/timestamps, foreign scope, flags and revisions', () => {
  const dto = { brandId: 'qa0-brand', locationId: 'qa0-location', printerId: 'qa0-printer', printerRevision: 1,
    credentialRevision: 0, state: 'missing', activationAuthorized: false, dispatchAuthorized: false };
  assert.doesNotThrow(() => exactMetadata(dto, 'missing', 1, 0));
  for (const patch of [{ secretDigest: 'private' }, { secret: 'private' }, { issuedAt: 1 }, { brandId: 'foreign' }, { dispatchAuthorized: true }, { printerRevision: 2 }])
    assert.throws(() => exactMetadata({ ...dto, ...patch }, 'missing', 1, 0), /QA504/);
});
test('missing runtime rejects actual proof before callback registration can run', async () => {
  await assert.rejects(runCredentialMetadataProof({ register() { assert.fail('invalid runtime cannot register'); } }), /QA504 runtime-rejected/);
});
