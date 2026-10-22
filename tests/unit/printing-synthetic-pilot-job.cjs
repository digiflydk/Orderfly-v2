const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const crypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const scope = { brandId: 'b1', locationId: 'l1', printerId: 'p1' };
const binding = { ...scope, printerRevision: 3, credentialRevision: 1 };
const root = 'locations/l1/printers/p1', sessionId = 's'.repeat(43);

function fixture(options = {}) {
  const draft = crypto.createPrinterDeviceCredentialDraft(binding);
  const now = Date.now(), rows = new Map([
    ['brands/b1', { status: 'active' }], ['locations/l1', { brandId: 'b1' }],
    [root, { schemaVersion: 1, revision: 3, deletedAt: null, createdAt: {}, updatedAt: {}, configuration: {
      id: 'p1', brandId: 'b1', locationId: 'l1', name: 'Test', manufacturer: 'star', model: 'mc-print3',
      transport: 'cloudprnt-http', state: 'active', paperWidthMm: 80 } }],
    [`${root}/deviceCredentials/current`, draft.record],
  ]);
  const reads = [], writes = [];
  let attempts = 0, retry = options.retry;
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), async runTransaction(callback) {
    for (;;) {
      attempts++; const staged = new Map();
      const result = await callback({ async get(r) {
        assert.equal(staged.size, 0, 'reads precede writes'); reads.push(r.path);
        const value = rows.get(r.path); return { id: r.id, exists: value !== undefined, data: () => structuredClone(value) };
      }, set(r, value) { staged.set(r.path, structuredClone(value)); } });
      if (retry) { const mutate = retry; retry = null; mutate(rows); continue; }
      if (options.failCommit) throw Error(`PRIVATE ${draft.secret}`);
      for (const [path, value] of staged) { rows.set(path, value); writes.push(path); }
      if (options.unknownCommit) throw Error('PRIVATE unknown');
      return result;
    }
  } };
  const api = loadTs('src/lib/printing/synthetic-pilot-job.ts', { 'server-only': {},
    '@/lib/firebase-admin': { getAdminDb: () => db } });
  const row = api.createSyntheticPilotJobRecord({ ...binding, sessionId, model: 'mc-print3', paperWidthMm: 80,
    createdAt: now, expiresAt: now + 600000 });
  rows.set(`${root}/pilotJobs/${sessionId}`, row);
  rows.set(`${root}/pilotState/current`, { schemaVersion: 1, sessionId });
  rows.set(`${root}/pilotQualifications/${sessionId}`, { schemaVersion: 1, ...binding, sessionId,
    nonceDigest: 'a'.repeat(64), actorId: 'firebase:operator', state: 'consumed', trust: 'supervised_operator',
    issuedAt: now, expiresAt: now + 600000, consumedAt: now, jobId: sessionId, contentDigest: row.content.sha256,
    outputAuthorized: false, dispatchAuthorized: false, activationAuthorized: false, physicalCompatibilityVerified: false });
  const request = { ...scope, authorization: `Basic ${Buffer.from(`orderfly:${draft.secret}`).toString('base64')}` };
  return { api, rows, row, draft, request, reads, writes, now, get attempts() { return attempts; },
    poll: (ready = true) => api.pollSyntheticPilotJob({ ...request, ready }), download: token => api.downloadSyntheticPilotJob({ ...request, token }),
    result: (token, outcome = 'confirmed') => api.recordSyntheticPilotResult({ ...request, token, outcome }) };
}
const job = f => f.rows.get(`${root}/pilotJobs/${sessionId}`);
function enabled(fn) { return async () => {
  const keys = ['ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED', 'ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED'];
  const old = keys.map(key => process.env[key]); keys.forEach(key => process.env[key] = 'true');
  try { await fn(); } finally { keys.forEach((key, i) => old[i] === undefined ? delete process.env[key] : process.env[key] = old[i]); }
}; }

test('canonical synthetic job advances once through native poll/download/result, no customer queue or plaintext persisted', enabled(async () => {
  const f = fixture(); assert.equal(f.api.syntheticPilotJobSchema.safeParse(f.row).success, true);
  const offered = await f.poll(); assert.equal(offered.jobReady, true); assert.match(offered.jobToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(job(f).state, 'offered'); assert.deepEqual(await f.poll(), offered);
  const downloaded = await f.download(offered.jobToken); assert.equal(downloaded.contentType, 'image/png');
  assert.equal(downloaded.payload[0], 137); assert.equal(job(f).state, 'download_started');
  await assert.rejects(f.download(offered.jobToken), /pilot_already_downloaded/);
  assert.deepEqual(await f.poll(), { jobReady: false });
  assert.equal((await f.result(offered.jobToken)).outcome, 'confirmed'); const saved = structuredClone(job(f));
  assert.equal((await f.result(offered.jobToken)).duplicate, true); assert.deepEqual(job(f), saved);
  await assert.rejects(f.result(offered.jobToken, 'unknown'), /invalid_pilot_job/);
  assert.equal(f.api.syntheticPilotJobSchema.safeParse(saved).success, true);
  const persisted = JSON.stringify([...f.rows]);
  assert.equal(persisted.includes(f.draft.secret), false); assert.equal(persisted.includes(offered.jobToken), false);
  assert.equal(f.writes.every(path => path.includes('/pilotJobs/')), true);
}));

test('output/config gates are exact default OFF, before any native I/O', async () => {
  for (const value of [undefined, 'false', 'TRUE', '1']) {
    const f = fixture(), old = process.env.ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED;
    if (value === undefined) delete process.env.ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED; else process.env.ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED = value;
    try { await assert.rejects(f.poll(), /pilot_unavailable/); assert.deepEqual(f.reads, []); }
    finally { if (old === undefined) delete process.env.ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED; else process.env.ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED = old; }
  }
});

test('busy/error device status can only withhold a job, after current native auth', enabled(async () => {
  const f = fixture(); assert.deepEqual(await f.poll(false), { jobReady: false });
  assert.equal(f.reads.includes(`${root}/deviceCredentials/current`), true);
  assert.equal(f.reads.some(path => path.includes('/pilotState/')), false); assert.deepEqual(f.writes, []);
}));
test('foreign scope, suspended tenant, inactive printer and revoked credential cannot read private pilot job', enabled(async () => {
  for (const change of [r => r.get('locations/l1').brandId = 'foreign', r => r.get('brands/b1').status = 'suspended',
    r => r.get(root).configuration.state = 'paused', r => r.get(root).configuration.state = 'disabled',
    r => r.set(`${root}/deviceCredentials/current`, { ...r.get(`${root}/deviceCredentials/current`), revokedAt: Date.now() })]) {
    const f = fixture(); change(f.rows); await assert.rejects(f.poll());
    assert.equal(f.reads.some(path => path.includes('/pilotJobs/')), false); assert.deepEqual(f.writes, []);
  }
}));

test('missing/foreign/corrupt/expired consumed session, content, pointer or revision never offers', enabled(async () => {
  for (const change of [r => r.delete(`${root}/pilotQualifications/${sessionId}`),
    r => r.get(`${root}/pilotQualifications/${sessionId}`).state = 'pending_operator_attestation',
    r => r.get(`${root}/pilotQualifications/${sessionId}`).contentDigest = 'f'.repeat(64),
    r => r.get(`${root}/pilotQualifications/${sessionId}`).credentialRevision++,
    r => r.get(`${root}/pilotJobs/${sessionId}`).content = { ...r.get(`${root}/pilotJobs/${sessionId}`).content, payloadBase64: 'AAAA' },
    r => r.get(`${root}/pilotJobs/${sessionId}`).jobId = 'x'.repeat(43),
    r => r.get(`${root}/pilotJobs/${sessionId}`).printerRevision++,
    r => r.get(`${root}/pilotState/current`).sessionId = '../wrong']) {
    const f = fixture(); change(f.rows); await assert.rejects(f.poll(), /invalid_pilot_job/); assert.deepEqual(f.writes, []);
  }
  const f = fixture(), realNow = Date.now; Date.now = () => f.row.expiresAt;
  try { await assert.rejects(f.poll(), /invalid_pilot_job/); } finally { Date.now = realNow; }
}));

test('wrong tokens and early result fail closed without moving state', enabled(async () => {
  const f = fixture(); const offered = await f.poll();
  await assert.rejects(f.download('a'.repeat(43)), /invalid_pilot_job/);
  await assert.rejects(f.result(offered.jobToken), /invalid_pilot_job/);
  assert.equal(job(f).state, 'offered'); assert.equal(f.writes.length, 1);
}));

test('unknown/failed results are terminal and never print-success or automatic retry', enabled(async () => {
  for (const outcome of ['unknown', 'failed']) {
    const f = fixture(); const offered = await f.poll(); await f.download(offered.jobToken);
    const result = await f.result(offered.jobToken, outcome); assert.equal(result.outcome, outcome);
    assert.equal(job(f).confirmedAt, null); assert.deepEqual(await f.poll(), { jobReady: false });
    await assert.rejects(f.download(offered.jobToken), /pilot_already_downloaded/);
    await assert.rejects(f.result(offered.jobToken, 'confirmed'), /invalid_pilot_job/);
  }
}));

test('retry reauthenticates, rollback does not offer token and unknown download commit cannot resend', enabled(async () => {
  const revoke = fixture({ retry: rows => rows.set(`${root}/deviceCredentials/current`, { ...rows.get(`${root}/deviceCredentials/current`), revokedAt: Date.now() }) });
  await assert.rejects(revoke.poll()); assert.equal(job(revoke).state, 'queued'); assert.deepEqual(revoke.writes, []);
  const rollback = fixture({ failCommit: true }); await assert.rejects(rollback.poll(), /pilot_unavailable/);
  assert.equal(job(rollback).state, 'queued');
  const options = {}, f = fixture(options); const offered = await f.poll();
  // Admin commits but cannot confirm the outcome. No bytes escape that call.
  options.unknownCommit = true;
  await assert.rejects(f.download(offered.jobToken), /pilot_unavailable/);
  options.unknownCommit = false;
  assert.equal(job(f).state, 'download_started');
  await assert.rejects(f.download(offered.jobToken), /pilot_already_downloaded/);
}));

test('bounded request rejects getters before invocation/native I/O and fixed errors hide provider detail', enabled(async () => {
  const f = fixture(); let touched = false; const request = { ...f.request, ready: true };
  Object.defineProperty(request, 'authorization', { enumerable: true, get() { touched = true; throw Error('PRIVATE'); } });
  await assert.rejects(f.api.pollSyntheticPilotJob(request), /invalid_pilot_job/); assert.equal(touched, false); assert.deepEqual(f.reads, []);
  await assert.rejects(f.api.pollSyntheticPilotJob({ ...f.request, ready: true, extra: true }), /invalid_pilot_job/);
  const fail = fixture({ failCommit: true }); await assert.rejects(fail.poll(), e => e.code === 'pilot_unavailable' && !String(e).includes('PRIVATE'));
}));
