'use strict';
// Fixed emulator proof. Request context and Admin construction are fixtures;
// authentication, authorization, native transaction and pilot modules are actual.
const fs = require('node:fs'), path = require('node:path'), net = require('node:net');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '../..'), PROJECT = 'demo-orderfly-qa0';
const NATIVE_ROOTS = ['platformAdminControl/access-v1', 'brands/qa0-pilot-brand', 'locations/qa0-pilot-location'];
let stage = 'runtime';
async function assertVacantRoots(db) {
  for (const key of NATIVE_ROOTS) {
    const ref = db.doc(key);
    assert.equal((await ref.get()).exists, false, 'refuse existing fixed seed');
    assert.equal((await ref.listCollections()).length, 0, 'refuse orphan descendant namespace');
  }
}
async function cleanupRegistered(db, expected) {
  // No recursive deletion: foreign/unregistered descendants are never touched.
  await db.runTransaction(async tx => {
    const current = await Promise.all([...expected.keys()].map(key => tx.get(db.doc(key))));
    for (const row of current) assert.ok(row.exists && row.updateTime.isEqual(expected.get(row.ref.path)), 'cleanup record ownership changed');
    for (const row of current) tx.delete(row.ref, { lastUpdateTime: expected.get(row.ref.path) });
  });
  await assertVacantRoots(db);
}
function assertCommittedSource(root = ROOT) {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no', '--', 'src', 'tests', 'scripts', 'package.json', 'package-lock.json'], { cwd: root, encoding: 'utf8' }).trim(), '', 'native proof sources must be committed');
  return commit;
}
function pilotEnvironment() {
  return { ...require('../../scripts/local-qa/environment.cjs').environment(),
    ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED: 'true', ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED: 'true' };
}
function assertRuntime(env = process.env, guarded = Reflect.get(globalThis, Symbol.for('orderfly.qa0.loopback-guard')) === true) {
  if (!guarded || env.ORDERFLY_LOCAL_QA !== 'true' || env.NODE_ENV !== 'development'
    || env.GCLOUD_PROJECT !== PROJECT || env.GOOGLE_CLOUD_PROJECT !== PROJECT
    || env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088' || env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
    || env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true' || env.ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED !== 'true'
    || Object.keys(env).some(key => /(?:^|_)proxy$/i.test(key)
      || /^(?:GOOGLE_APPLICATION_CREDENTIALS|FB_SERVICE_ACCOUNT_JSON|STRIPE_SECRET_KEY|SMTP_PASSWORD|ORDERFLY_PRINT_INTENTS_ENABLED|ORDERFLY_PRINT_OUTPUT_ENABLED|ORDERFLY_PRINT_DISPATCH_ENABLED)$/.test(key))) throw Error('Pilot native runtime rejected');
}
function preflight() {
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    if (fs.existsSync(path.join(ROOT, name))) throw Error('Pilot native dotenv rejected');
  }
  assertRuntime(pilotEnvironment(), true);
  return { project: PROJECT, configuredAdminBindingFixture: true, nextRequestContextFixture: true,
    productionAcceptance: false, physicalPrintVerified: false };
}
async function child() {
  assertRuntime(); preflight();
  const commit = assertCommittedSource();
  globalThis.AsyncLocalStorage ||= require('node:async_hooks').AsyncLocalStorage;
  const admin = require('firebase-admin');
  const app = admin.initializeApp({ projectId: PROJECT,
    credential: { getAccessToken: async () => ({ access_token: 'owner', expires_in: 3600 }) } }, 'qa-pilot-native');
  const db = new (require('@google-cloud/firestore').Firestore)({ projectId: PROJECT, host: '127.0.0.1:8088', ssl: false,
    credentials: { client_email: 'qa-pilot@demo-orderfly-qa0.invalid', private_key: 'LOCAL_EMULATOR_ONLY_NOT_A_PRIVATE_KEY' } });
  const { moduleGraph } = require('../helpers/load-ts-graph.cjs');
  const load = moduleGraph({ 'server-only': {}, react: require('next/dist/compiled/react'),
    '@/lib/firebase-admin': { getAdminDb: () => db, getAdminApp: () => app,
      getAdminFieldValue: () => require('firebase-admin/firestore').FieldValue } });
  const scope = { brandId: 'qa0-pilot-brand', locationId: 'qa0-pilot-location', printerId: 'qa0-pilot-printer' };
  const binding = { ...scope, printerRevision: 1, credentialRevision: 1 };
  const printerPath = `locations/${scope.locationId}/printers/${scope.printerId}`;
  const roots = NATIVE_ROOTS;
  let uid, ownsSeed = false, cleaned = false;
  const expected = new Map();
  const remember = async paths => { for (const key of paths) { const row = await db.doc(key).get(); assert.equal(row.exists,true); expected.set(key,row.updateTime); } };
  const nonceMarker = require('node:crypto').randomBytes(24).toString('base64url');
  try {
    stage = 'seed';
    await assertVacantRoots(db);
    // Real emulator regression: an absent parent with a foreign orphan must
    // reject ownership without changing that orphan. Delete only this probe's
    // exact create/version afterward, never the namespace it demonstrates.
    const orphan = db.doc(roots[2]+'/foreign/keep');
    const probe = await orphan.create({ probeOwner: nonceMarker });
    try {
      await assert.rejects(assertVacantRoots(db), /orphan descendant/);
      assert.deepEqual((await orphan.get()).data(), { probeOwner: nonceMarker });
    } finally { await orphan.delete({ lastUpdateTime: probe.writeTime }); }
    await assertVacantRoots(db);
    stage = 'auth';
    const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=qa0-public-only', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'pilot@qa0.example.invalid',
        password: require('node:crypto').randomBytes(24).toString('base64url'), returnSecureToken: true }) });
    assert.equal(response.ok, true); const signed = await response.json(); uid = signed.localId;
    const cookie = await app.auth().createSessionCookie(signed.idToken, { expiresIn: 3600000 });
    const actorId = load('src/lib/access/authority.ts').principalKey({ provider: 'firebase', subject: uid });
    const credential = load('src/lib/printing/device-auth.ts').createPrinterDeviceCredentialDraft(binding);
    const policy = { principals: [{ id: actorId, active: true, name: 'QA Pilot' }],
      companies: [{ id: 'qa0-pilot-company', active: true, locationIds: [scope.locationId], orderflyBrandIds: [scope.brandId] }],
      roles: [{ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', active: true, permissions: [] }],
      memberships: [{ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true }] };
    const batch = db.batch(); batch.create(db.doc(roots[0]), policy);
    batch.create(db.doc(roots[1]), { id: scope.brandId, status: 'active' });
    batch.create(db.doc(roots[2]), { id: scope.locationId, brandId: scope.brandId, qaPilotOwner: nonceMarker });
    batch.create(db.doc(printerPath), { schemaVersion: 1, revision: 1, deletedAt: null, configuration: { id: scope.printerId,
      brandId: scope.brandId, locationId: scope.locationId, name: 'Synthetic emulator only', manufacturer: 'star', model: 'mc-print3',
      transport: 'cloudprnt-http', state: 'active', paperWidthMm: 80 } });
    batch.create(db.doc(printerPath + '/deviceCredentials/current'), credential.record);
    const seeded = await batch.commit(); ownsSeed = true;
    [roots[0],roots[1],roots[2],printerPath,printerPath+'/deviceCredentials/current'].forEach((key,index)=>expected.set(key,seeded[index].writeTime));
    const { workAsyncStorage } = require('next/dist/server/app-render/work-async-storage.external');
    const { workUnitAsyncStorage } = require('next/dist/server/app-render/work-unit-async-storage.external');
    const { RequestCookies } = require('next/dist/server/web/spec-extension/cookies');
    const { RequestCookiesAdapter } = require('next/dist/server/web/spec-extension/adapters/request-cookies');
    const request = fn => workAsyncStorage.run({ route: '/qa-pilot-native', isStaticGeneration: false }, () =>
      workUnitAsyncStorage.run({ type: 'request', phase: 'render', cookies: RequestCookiesAdapter.seal(new RequestCookies(new Headers({ cookie: `__session=${cookie}` }))) }, fn));
    const issuance = load('src/lib/printing/pilot-qualification.ts');
    const consumer = load('src/lib/printing/pilot-qualification-consumption.ts');
    const pilot = load('src/lib/printing/synthetic-pilot-job.ts');
    stage = 'issuance';
    const issued = await request(() => issuance.issuePilotQualificationSession(binding));
    assert.match(issued.sessionId,/^[A-Za-z0-9_-]{43}$/);
    await remember([`${printerPath}/pilotQualifications/${issued.sessionId}`,`${printerPath}/pilotQualificationAudit/${issued.sessionId}`]);
    const attestation = { ...binding, sessionId: issued.sessionId, nonce: issued.nonce, trust: 'supervised_operator',
      operatorId: 'emulator_fixture', physicalDeviceIdentified: true, nativeEnrollmentCorrelated: true,
      method: 'stario_firmware_query', model: 'mc-print3', labelSku: 'SYNTHETIC_FIXTURE', firmware: '3.2', captureDigest: 'b'.repeat(64),
      paperWidthMm: 80, rasterWidthDots: 576, transport: 'cloudprnt-http', mediaType: 'image/png' };
    stage = 'consumption';
    const results = await Promise.allSettled([request(() => consumer.consumePilotQualification(attestation)), request(() => consumer.consumePilotQualification(attestation))]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1, 'real concurrent transactions consume once');
    const jobPath = `${printerPath}/pilotJobs/${issued.sessionId}`;
    const atomics = await Promise.all([`${printerPath}/pilotQualifications/${issued.sessionId}`, jobPath,
      `${printerPath}/pilotState/current`, `${printerPath}/pilotQualificationAudit/${issued.sessionId}-consume`].map(p => db.doc(p).get()));
    assert.ok(atomics.every(row => row.exists));
    assert.ok(atomics.every(row => row.updateTime.isEqual(atomics[0].updateTime)), 'all four native writes share a commit');
    for(const row of atomics)expected.set(row.ref.path,row.updateTime);
    stage = 'delivery';
    const device = { ...scope, authorization: `Basic ${Buffer.from(`orderfly:${credential.secret}`).toString('base64')}` };
    const offered = await pilot.pollSyntheticPilotJob({ ...device, ready: true }); assert.equal(offered.jobReady, true);
    await remember([jobPath]);
    const downloaded = await pilot.downloadSyntheticPilotJob({ ...device, token: offered.jobToken });
    await remember([jobPath]);
    assert.equal(downloaded.contentType, 'image/png'); assert.equal(downloaded.payload[0], 137);
    await assert.rejects(pilot.downloadSyntheticPilotJob({ ...device, token: offered.jobToken }));
    assert.deepEqual(await pilot.pollSyntheticPilotJob({ ...device, ready: true }), { jobReady: false });
    await pilot.recordSyntheticPilotResult({ ...device, token: offered.jobToken, outcome: 'unknown' });
    assert.deepEqual(await pilot.pollSyntheticPilotJob({ ...device, ready: true }), { jobReady: false });
    const terminal = await db.doc(jobPath).get(); assert.equal(terminal.data().state, 'unknown'); assert.equal(terminal.data().confirmedAt, null);
    expected.set(jobPath,terminal.updateTime);
    const persisted = JSON.stringify(atomics.map(row => row.data()).concat(terminal.data()));
    for (const secret of [issued.nonce, credential.secret, offered.jobToken, cookie]) assert.equal(persisted.includes(secret), false);
  } finally {
    try {
      try {
        if (ownsSeed) { await cleanupRegistered(db,expected); cleaned = true; }
      } finally {
        if (uid) { await app.auth().deleteUser(uid); await assert.rejects(app.auth().getUser(uid), error => error.code === 'auth/user-not-found'); }
      }
    } finally { await db.terminate(); await app.delete(); }
  }
  assert.equal(cleaned, true);
  return { ...preflight(), sourceCommit: commit, nativeExecution: true, realAuthSession: true,
    concurrentConsumeWinners: 1, sameNativeCommit: true, orphanPreserved: true, downloadOnce: true, unknownNeverResends: true, cleanupVerified: true };
}
async function run() {
  preflight();
  const firebase = process.env.QA0_FIREBASE_BIN, java = process.env.QA0_JAVA_BIN;
  for (const binary of [firebase, java]) if (!binary || !path.isAbsolute(binary) || !fs.existsSync(binary)) throw Error('Pilot native tools unavailable');
  const env = pilotEnvironment(); const tools = { PATH: path.dirname(java) + path.delimiter + env.PATH, LANG: env.LANG, TZ: env.TZ, CI: 'true', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true', FIREBASE_CLI_DISABLE_USAGE_REPORTING: 'true' };
  const cli = spawnSync(firebase, ['--version'], { env: tools, encoding: 'utf8' });
  const jvm = spawnSync(java, ['-version'], { env: tools, encoding: 'utf8' });
  if (cli.status !== 0 || cli.stdout.trim() !== '15.30.0' || jvm.status !== 0 || !/version "21\./.test(jvm.stderr)) throw Error('Pilot native tools rejected');
  for (const port of [3100,8088,9099,4400,4500,9150]) await new Promise((resolve,reject) => { const server=net.createServer();server.once('error',()=>reject(Error('Pilot native ports unavailable')));server.listen(port,'127.0.0.1',()=>server.close(resolve)); });
  const dir = fs.mkdtempSync('/tmp/orderfly-pilot-native-'); fs.chmodSync(dir, 0o700);
  const fd = fs.openSync(path.join(dir, 'emulator.log'), 'wx', 0o600);
  const emulator = spawn(firebase, ['emulators:start', '--project', PROJECT, '--only', 'auth,firestore', '--config', path.join(ROOT, 'tests/local-qa/firebase.json')], { cwd: dir, env: tools, stdio: ['ignore',fd,fd], detached: true }); fs.closeSync(fd);
  try {
    const until = Date.now() + 90000;
    for (;;) { if (emulator.exitCode !== null || Date.now() > until) throw Error('Pilot native emulator unavailable');
      try { if ((await fetch('http://127.0.0.1:8088/', {signal:AbortSignal.timeout(2000)})).status < 500 && (await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-orderfly-qa0/config', {signal:AbortSignal.timeout(2000)})).ok) break; } catch {}
      await new Promise(resolve=>setTimeout(resolve,400)); }
    const passes = [];
    for (let pass=0;pass<2;pass++) {
      const result = spawnSync(process.execPath, [__filename, '--child'], { cwd: ROOT, env, encoding:'utf8',timeout:60000,maxBuffer:16384 });
      if (result.status !== 0) {
        const failed=/^Pilot native transaction proof failed at (runtime|seed|auth|issuance|consumption|delivery)\n$/.exec(result.stderr);
        if(failed)stage=failed[1];
        throw Error('Pilot native child failed');
      }
      const proof = JSON.parse(result.stdout); assert.equal(proof.cleanupVerified,true); passes.push(proof);
    }
    return { ...passes[1], sameEmulatorPasses: passes.length };
  } finally { if (emulator.exitCode === null) { try { process.kill(-emulator.pid,'SIGTERM'); } catch { emulator.kill('SIGTERM'); } } }
}
async function main(args = process.argv.slice(2)) {
  if (args.length !== 1 || !['--preflight','--run','--child'].includes(args[0])) throw Error('Pilot native arguments rejected');
  return args[0] === '--preflight' ? preflight() : args[0] === '--run' ? run() : child();
}
if (require.main === module) main().then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('Pilot native transaction proof failed at '+stage);process.exitCode=1;});
module.exports = { pilotEnvironment, assertRuntime, assertVacantRoots, cleanupRegistered, assertCommittedSource, preflight, main };
