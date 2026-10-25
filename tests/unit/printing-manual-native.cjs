const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { loadTs } = require('../helpers/load-ts.cjs');
const { moduleGraph } = require('../helpers/load-ts-graph.cjs');
const credentials = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const scope = { brandId: 'b1', locationId: 'l1', printerId: 'p1' }, prefix = 'locations/l1/printers/p1';
const path = (collection, id = 'current') => `${prefix}/${collection}/${id}`;
const enabled = fn => async () => {
  const key = 'ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED', before = process.env[key]; process.env[key] = 'true';
  try { await fn(); } finally { before === undefined ? delete process.env[key] : process.env[key] = before; }
};
function fixture() {
  const now = Date.now(), requestId = randomUUID();
  const draft = credentials.createPrinterDeviceCredentialDraft({ ...scope, printerRevision: 3, credentialRevision: 1 });
  const png = Buffer.alloc(40); Buffer.from('89504e470d0a1a0a', 'hex').copy(png); png.writeUInt32BE(576, 16);
  const configuration = { id: 'p1', brandId: 'b1', locationId: 'l1', name: 'Køkken', manufacturer: 'star',
    model: 'mc-print3', transport: 'cloudprnt-http', state: 'active', paperWidthMm: 80 };
  const job = { schemaVersion: 1, ...scope, orderId: 'completed-order', kind: 'customer', requestId, jobId: requestId,
    printerRevision: 3, credentialRevision: 1, actorId: 'firebase:admin', createdAt: now - 1000, expiresAt: now - 1000 + 600000,
    state: 'queued', payloadBase64: png.toString('base64'), sha256: createHash('sha256').update(png).digest('hex'), byteLength: png.length,
    offeredAt: null, downloadedAt: null, completedAt: null, tokenDigest: null };
  const rows = new Map([
    ['brands/b1', { status: 'active' }], ['locations/l1', { brandId: 'b1' }],
    [prefix, { schemaVersion: 1, revision: 3, deletedAt: null, configuration }], [path('deviceCredentials'), draft.record],
    [path('manualPrintRequests', requestId), job], [path('manualState'), { schemaVersion: 1, requestId }],
    [path('originalPrintHistory', 'original'), { untouched: true }],
  ]);
  let serial = Promise.resolve(), failCommit = false, retry = null;
  const commits = [], reads = [];
  const collection = p => ({ doc: id => ({ path: `${p}/${id}`, id, collection: n => collection(`${p}/${id}/${n}`) }) });
  const db = { collection, runTransaction(callback) {
    const run = serial.then(async () => {
      for (;;) {
        let writing = false; const staged = new Map(), deleted = new Set();
        const tx = { async get(ref) {
          assert.equal(writing, false, 'reads precede writes'); reads.push(ref.path);
          const value = rows.get(ref.path); return { id: ref.id, exists: rows.has(ref.path), data: () => structuredClone(value) };
        }, create(ref, value) { writing = true; assert.equal(rows.has(ref.path), false); staged.set(ref.path, structuredClone(value)); },
        set(ref, value) { writing = true; staged.set(ref.path, structuredClone(value)); }, delete(ref) { writing = true; deleted.add(ref.path); } };
        const result = await callback(tx);
        if (retry) { const mutate = retry; retry = null; mutate(rows); continue; }
        if (failCommit) throw Error('COMMIT_FAILURE');
        for (const p of deleted) rows.delete(p); for (const row of staged) rows.set(...row);
        commits.push([...staged.keys(), ...deleted]); return result;
      }
    }); serial = run.catch(() => {}); return run;
  } };
  const load = moduleGraph({ react: require('next/dist/compiled/react'), 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db },
    './ordinary-output-policy': { OrdinaryOutputPolicyError: class extends Error {}, requireOrdinaryOutputPolicy: async () => ({}) },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 1 } },
  });
  const api = load('src/lib/printing/manual-print-native.ts');
  const command = { ...scope, authorization: `Basic ${Buffer.from(`orderfly:${draft.secret}`).toString('base64')}` };
  const poll = (ready = true) => api.pollManualPrint({ ...command, ready });
  const download = token => api.downloadManualPrint({ ...command, token });
  const confirm = (token, code = '200 OK') => api.recordManualPrintResult({ ...command,
    query: new URLSearchParams({ token, mac: '00:11:22:33:44:55', code }).toString() });
  const httpApi = load('src/lib/printing/ordinary-print-http.ts');
  const http = (method, suffix = '', body = { statusCode: '200 OK' }) => httpApi.handleOrdinaryPrintHttp(
    new Request(`https://orderfly.test/api/cloudprnt/b1/l1/p1${suffix}`, { method,
      headers: { authorization: command.authorization, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }), Promise.resolve(scope), true);
  return { rows, job, requestId, db, api, command, poll, download, confirm, commits, reads, load, http,
    failCommit(value = true) { failCommit = value; }, retry(fn) { retry = fn; } };
}

test('manual customer receipt works without an automatic window, transfers once and acknowledges idempotently', enabled(async () => {
  const f = fixture(), offer = await f.poll(); assert.equal(offer.jobReady, true);
  assert.deepEqual(await f.poll(), { jobReady: false });
  const bytes = await f.download(offer.jobToken); assert.equal(bytes.contentType, 'image/png');
  assert.equal(bytes.payload.readUInt32BE(16), 576);
  await assert.rejects(f.download(offer.jobToken), /manual_print_conflict/);
  assert.deepEqual(await f.confirm(offer.jobToken), { outcome: 'confirmed', duplicate: false });
  assert.equal(f.rows.has(path('manualState')), false);
  assert.deepEqual(await f.confirm(offer.jobToken), { outcome: 'confirmed', duplicate: true });
  assert.equal(await f.poll(), null);
  assert.deepEqual(f.rows.get(path('originalPrintHistory', 'original')), { untouched: true });
  assert.equal(JSON.stringify([...f.rows]).includes(offer.jobToken), false, 'raw tokens are never stored');
}));

test('busy/paper-out and an ordinary in-flight pointer prevent manual offer; manual pointer blocks ordinary offer', enabled(async () => {
  const f = fixture(); assert.deepEqual(await f.poll(false), { jobReady: false });
  f.rows.set(path('ordinaryState'), { schemaVersion: 1, jobId: 'original' });
  assert.deepEqual(await f.poll(), { jobReady: false });
  assert.equal(f.rows.get(path('manualPrintRequests', f.requestId)).state, 'queued');
  f.rows.delete(path('ordinaryState'));
  const ordinary = f.load('src/lib/printing/ordinary-print-native.ts');
  assert.deepEqual(await ordinary.pollOrdinaryPrint({ ...f.command, ready: true }), { jobReady: false });
  assert.equal(f.rows.has(path('ordinaryState')), false);
}));

test('expired untouched jobs release occupancy but downloaded ambiguity never retries', enabled(async () => {
  const untouched = fixture(); untouched.job.createdAt -= 600000; untouched.job.expiresAt -= 600000;
  assert.deepEqual(await untouched.poll(), { jobReady: false });
  assert.equal(untouched.rows.get(path('manualPrintRequests', untouched.requestId)).state, 'expired');
  assert.equal(untouched.rows.has(path('manualState')), false);
  const f = fixture(), offer = await f.poll(); await f.download(offer.jobToken);
  const row = f.rows.get(path('manualPrintRequests', f.requestId)); row.createdAt -= 61000; row.expiresAt -= 61000;
  row.offeredAt -= 61000; row.downloadedAt -= 61000;
  assert.deepEqual(await f.poll(), { jobReady: false });
  assert.equal(f.rows.get(path('manualPrintRequests', f.requestId)).state, 'unknown');
  assert.equal(f.rows.has(path('manualState')), true);
  await assert.rejects(f.download(offer.jobToken)); await assert.rejects(f.confirm(offer.jobToken));
}));

test('failed or unclear printer acknowledgement never confirms or silently reoffers', enabled(async () => {
  for (const code of ['500 Error', '220 Busy']) {
    const f = fixture(), offer = await f.poll(); await f.download(offer.jobToken);
    const result = await f.confirm(offer.jobToken, code); assert.equal(result.outcome, code.startsWith('500') ? 'failed' : 'unknown');
    assert.equal(f.rows.has(path('manualState')), true); assert.deepEqual(await f.poll(), { jobReady: false });
    await assert.rejects(f.confirm(offer.jobToken));
  }
}));

test('revisions, wrong scope, revoked credential, corruption and disabled output reject before bytes', enabled(async () => {
  for (const mutate of [
    f => { f.rows.get(prefix).revision++; },
    f => { f.rows.set(path('deviceCredentials'), { ...f.rows.get(path('deviceCredentials')), revokedAt: Date.now() }); },
    f => { f.rows.get(path('manualPrintRequests', f.requestId)).brandId = 'other'; },
    f => { f.rows.get(path('manualPrintRequests', f.requestId)).payloadBase64 = Buffer.from('corrupt').toString('base64'); },
    f => { f.rows.get(prefix).configuration.state = 'paused'; },
  ]) {
    const f = fixture(), offer = await f.poll(); mutate(f); await assert.rejects(f.download(offer.jobToken));
    assert.equal(f.rows.get(path('manualPrintRequests', f.requestId)).downloadedAt, null);
  }
  const f = fixture(), offer = await f.poll(); delete process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED;
  await assert.rejects(f.download(offer.jobToken), /manual_print_unavailable/);
}));

test('competing GETs return bytes once, commit failure never transfers and retry reauthenticates', enabled(async () => {
  const f = fixture(); f.failCommit(); await assert.rejects(f.poll(), /COMMIT/);
  assert.equal(f.rows.get(path('manualPrintRequests', f.requestId)).state, 'queued');
  f.failCommit(false); const offer = await f.poll(); f.failCommit(); await assert.rejects(f.download(offer.jobToken), /COMMIT/);
  assert.equal(f.rows.get(path('manualPrintRequests', f.requestId)).state, 'offered');
  f.failCommit(false); const results = await Promise.allSettled([f.download(offer.jobToken), f.download(offer.jobToken)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const other = fixture(), next = await other.poll(); other.retry(rows => { rows.set(path('deviceCredentials'), { ...rows.get(path('deviceCredentials')), revokedAt: Date.now() }); });
  await assert.rejects(other.download(next.jobToken)); assert.equal(other.rows.get(path('manualPrintRequests', other.requestId)).downloadedAt, null);
}));

test('old acknowledgement does not clear a newer manual pointer; unknown token only permits ordinary lookup', enabled(async () => {
  const f = fixture(), offer = await f.poll(); await f.download(offer.jobToken); await f.confirm(offer.jobToken);
  const newer = randomUUID(); f.rows.set(path('manualState'), { schemaVersion: 1, requestId: newer });
  assert.deepEqual(await f.confirm(offer.jobToken), { outcome: 'confirmed', duplicate: true });
  assert.equal(f.rows.get(path('manualState')).requestId, newer);
  assert.equal(await f.download('A'.repeat(43)), null);
}));

test('Live HTTP offers and transfers a manual job without an automatic policy', enabled(async () => {
  const f = fixture(); const offered = await f.http('POST'); assert.equal(offered.status, 200);
  const body = await offered.json(); assert.equal(body.jobReady, true); assert.equal(body.deleteMethod, 'DELETE');
  const query = `?mac=00%3A11%3A22%3A33%3A44%3A55&token=${body.jobToken}`;
  assert.equal((await f.http('GET', query)).status, 200);
  assert.equal((await f.http('GET', query)).status, 409);
  assert.equal((await f.http('DELETE', `${query}&code=200%20OK`)).status, 200);
  assert.equal((await f.http('DELETE', `${query}&code=OK`)).status, 200);
  assert.equal(f.rows.get(path('manualPrintRequests', f.requestId)).state, 'confirmed');
}));

test('transaction retry observes a competing ordinary offer rather than exposing two jobs', enabled(async () => {
  const f = fixture(); f.retry(rows => { rows.set(path('ordinaryState'), { schemaVersion: 1, jobId: 'ordinary-winner' }); });
  assert.deepEqual(await f.poll(), { jobReady: false });
  assert.equal(f.rows.get(path('manualPrintRequests', f.requestId)).state, 'queued');
  assert.equal([...f.rows.keys()].some(key => key.includes('/manualTokens/')), false);
}));

test('manual ownership corruption fails closed and inactive printers do not offer', enabled(async () => {
  const f = fixture(), offer = await f.poll();
  const indexPath = [...f.rows.keys()].find(key => key.includes('/manualTokens/'));
  f.rows.set(indexPath, { schemaVersion: 1, requestId: 'not-an-id' });
  await assert.rejects(f.download(offer.jobToken), /manual_print_conflict/);
  const paused = fixture(); paused.rows.get(prefix).configuration.state = 'paused';
  assert.deepEqual(await paused.poll(), { jobReady: false });
  const pending = fixture(); pending.rows.get('brands/b1').status = 'pending';
  assert.deepEqual(await pending.poll(), { jobReady: false });
  pending.rows.delete(path('manualState')); assert.equal(await pending.poll(), null);
}));

test('rotation expires untouched stale work and releases ordinary fallback without reviving old bytes', enabled(async () => {
  for (const revisionChange of ['credential', 'configuration']) {
    for (const offered of [false, true]) {
      const f = fixture(); const offer = offered ? await f.poll() : null;
      if (revisionChange === 'configuration') f.rows.get(prefix).revision++;
      const replacement = credentials.createPrinterDeviceCredentialDraft({ ...scope,
        printerRevision: f.rows.get(prefix).revision, credentialRevision: 2 });
      f.rows.set(path('deviceCredentials'), replacement.record);
      f.command.authorization = `Basic ${Buffer.from(`orderfly:${replacement.secret}`).toString('base64')}`;
      // A stale request cannot be delivered with the replacement credential.
      if (offer) await assert.rejects(f.download(offer.jobToken));
      assert.deepEqual(await f.poll(), { jobReady: false });
      const job = f.rows.get(path('manualPrintRequests', f.requestId));
      job.createdAt -= 600001; job.expiresAt -= 600001;
      if (job.offeredAt !== null) job.offeredAt -= 600001;
      assert.deepEqual(await f.poll(), { jobReady: false });
      assert.equal(f.rows.get(path('manualPrintRequests', f.requestId)).state, 'expired');
      assert.equal(f.rows.has(path('manualState')), false);
      assert.equal(await f.poll(), null, 'ordinary lane is allowed again');
      assert.equal(f.rows.get(path('manualPrintRequests', f.requestId)).downloadedAt, null);
    }
  }
  const ambiguous = fixture(), offer = await ambiguous.poll(); await ambiguous.download(offer.jobToken);
  const replacement = credentials.createPrinterDeviceCredentialDraft({ ...scope, printerRevision: 3, credentialRevision: 2 });
  ambiguous.rows.set(path('deviceCredentials'), replacement.record);
  ambiguous.command.authorization = `Basic ${Buffer.from(`orderfly:${replacement.secret}`).toString('base64')}`;
  const row = ambiguous.rows.get(path('manualPrintRequests', ambiguous.requestId));
  row.createdAt -= 600001; row.expiresAt -= 600001; row.offeredAt -= 600001; row.downloadedAt -= 600001;
  assert.deepEqual(await ambiguous.poll(), { jobReady: false });
  assert.equal(ambiguous.rows.get(path('manualPrintRequests', ambiguous.requestId)).state, 'unknown');
  assert.equal(ambiguous.rows.has(path('manualState')), true, 'rotation never clears downloaded ambiguity');
}));
