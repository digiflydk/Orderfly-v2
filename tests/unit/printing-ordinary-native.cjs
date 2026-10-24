const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loadTs } = require('../helpers/load-ts.cjs');
const { moduleGraph } = require('../helpers/load-ts-graph.cjs');
const credentials = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const { printJobId } = loadTs('src/lib/printing/domain.ts');
const scope = { brandId: 'b1', locationId: 'l1', printerId: 'p1' }, prefix = 'locations/l1/printers/p1';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const path = (collection, id = 'current') => `${prefix}/${collection}/${id}`;
const enabled = fn => async () => {
  const keys = ['ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED', 'ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED'];
  const before = keys.map(k => process.env[k]); keys.forEach(k => process.env[k] = 'true');
  try { await fn(); } finally { keys.forEach((k, i) => before[i] === undefined ? delete process.env[k] : process.env[k] = before[i]); }
};
async function fixture() {
  const now = Date.now(), draft = credentials.createPrinterDeviceCredentialDraft({ ...scope, printerRevision: 3, credentialRevision: 1 });
  const configuration = { id: 'p1', brandId: 'b1', locationId: 'l1', name: 'Køkken', manufacturer: 'star',
    model: 'mc-print3', transport: 'cloudprnt-http', state: 'active', paperWidthMm: 80 };
  const job = { schemaVersion: 1, ...scope, orderId: 'o1', kind: 'kitchen', revision: 0, printerRevision: 3,
    state: 'queued', attempts: 0, createdAt: now - 1000, updatedAt: 1 };
  job.id = printJobId(job);
  const rows = new Map([
    ['brands/b1', { status: 'active' }], ['locations/l1', { brandId: 'b1' }],
    [prefix, { schemaVersion: 1, revision: 3, deletedAt: null, configuration }],
    [path('deviceCredentials'), draft.record], [path('jobs', job.id), job],
    [path('queue', 'state'), { schemaVersion: 1, ...scope, revision: 1, pendingCount: 1, oldestPendingAt: job.createdAt, updatedAt: 1 }],
    [path('statusMetadata'), { schemaVersion: 1, ...scope, activatedAt: now - 10000, activationRevision: 3,
      printHistory: 'never', lastConfirmedPrintAt: null, lastConfirmedJobId: null }],
    ['orders/o1', { brandId: 'b1', locationId: 'l1', status: 'Received', paymentStatus: 'Paid', paymentMethod: 'Stripe',
      deliveryType: 'Pickup', deliveryTime: 'Hurtigst muligt', productItems: [
        { id: 'pizza', itemType: 'product', name: 'Pizza æøå', quantity: 2, toppings: ['Uden løg'] },
      ] }],
    ['products/pizza', { brandId: 'b1', productName: 'Pizza æøå', isActive: true, locationIds: ['l1'], categoryId: 'cat' }],
    ['categories/cat', { isActive: true, locationIds: ['l1'] }],
  ]);
  const window = { schemaVersion: 1, ...scope, printerRevision: 3, credentialRevision: 1,
    model: 'mc-print3', paperWidthMm: 80, issuedAt: now - 5000, expiresAt: now - 5000 + 3600000,
    qualificationId: 'q'.repeat(43), routingRevision: 1, trust: 'supervised_order_test', actorId: 'firebase:supervisor', stoppedAt: null,
    physicalPaperCheckedByOperator: true, unattendedAuthorized: false };
  rows.set(path('orderTestWindows'), window);
  let serial = Promise.resolve(), failCommit = false, retry = null;
  const commits = [], reads = [];
  const collection = p => ({ doc: id => ({ path: `${p}/${id}`, id, collection: n => collection(`${p}/${id}/${n}`) }), limit: n => ({ query: p, limit: n }) });
  const db = { collection, runTransaction(callback) {
    const run = serial.then(async () => {
      for (;;) {
        let writing = false; const staged = new Map(), deleted = new Set();
        const tx = { async get(ref) {
          assert.equal(writing, false, 'native reads precede every write'); reads.push(ref.path || ref.query);
          if (ref.query) {
            const values = [...rows].filter(([p]) => p.startsWith(`${ref.query}/`) && !p.slice(ref.query.length + 1).includes('/')).slice(0, ref.limit);
            return { size: values.length, docs: values.map(([p, value]) => ({ id: p.split('/').at(-1), exists: true, data: () => structuredClone(value) })) };
          }
          const value = rows.get(ref.path); return { id: ref.id, exists: rows.has(ref.path), data: () => structuredClone(value) };
        }, create(ref, value) { writing = true; assert.equal(rows.has(ref.path), false); staged.set(ref.path, structuredClone(value)); },
        set(ref, value) { writing = true; staged.set(ref.path, structuredClone(value)); },
        delete(ref) { writing = true; deleted.add(ref.path); } };
        const result = await callback(tx);
        if (retry) { const mutate = retry; retry = null; mutate(rows); continue; }
        if (failCommit) throw Error('PRIVATE_COMMIT_FAILURE');
        for (const p of deleted) rows.delete(p);
        for (const row of staged) rows.set(...row);
        commits.push([...staged.keys(), ...deleted]);
        return result;
      }
    }); serial = run.catch(() => {}); return run;
  } };
  const mocks = { react: require('next/dist/compiled/react'), 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => 1 } },
    '@/lib/access/orderfly-session': { requirePlatformSuperuser() { throw Error('unused admin surface'); } },
    '@/lib/access/scoped-data': { authorizeTransaction() { throw Error('unused admin surface'); } },
  };
  const load = moduleGraph(mocks);
  const api = load('src/lib/printing/ordinary-print-native.ts');
  const content = load('src/lib/printing/ordinary-job-content.ts');
  const catalog = await db.runTransaction(transaction => load('src/lib/printing/catalog-line-projection.ts')
    .projectNativePrintCatalog({ db, transaction }, { orderId: 'o1', brandId: 'b1', locationId: 'l1' }));
  rows.set('orders/o1/printIntents/original', { schemaVersion: 1, id: 'original', orderId: 'o1', brandId: 'b1', locationId: 'l1',
    originalRevision: 0, policyRevision: 1, routingRevision: 1, rulesHash: 'a'.repeat(64), catalogHash: hash(catalog), createdAt: job.createdAt,
    targets: [{ printerId: 'p1', printerRevision: 3, configurationHash: hash(configuration), kinds: ['kitchen'], lineIds: ['line-0'] }] });
  commits.length = 0;
  const command = { ...scope, authorization: `Basic ${Buffer.from(`orderfly:${draft.secret}`).toString('base64')}` };
  const poll = () => api.pollOrdinaryPrint({ ...command, ready: true });
  const download = token => api.downloadOrdinaryPrint({ ...command, token });
  const confirm = (token, code = '200 OK') => api.recordOrdinaryPrintResult({ ...command,
    query: new URLSearchParams({ token, mac: '00:11:22:33:44:55', code }).toString() });
  const replay = () => db.runTransaction(async transaction => {
    const outbox = load('src/lib/printing/outbox.ts');
    const plan = await outbox.prepareOriginalPrintIntent(db, transaction, { ...scope, orderId: 'o1', kind: 'kitchen' });
    plan.apply(); return plan.created;
  });
  const route = load('src/app/api/cloudprnt/[brandId]/[locationId]/[printerId]/route.ts');
  const results = load('src/lib/printing/print-result-native.ts');
  const enqueueOther = async orderId => {
    rows.set(`orders/${orderId}`, structuredClone(rows.get('orders/o1')));
    return db.runTransaction(async transaction => {
      const createdAt = Date.now();
      const catalog = await load('src/lib/printing/catalog-line-projection.ts').projectNativePrintCatalog(
        { db, transaction }, { orderId, brandId: 'b1', locationId: 'l1' });
      const plan = await load('src/lib/printing/outbox.ts').prepareOriginalPrintIntent(db, transaction,
        { ...scope, orderId, kind: 'kitchen' });
      transaction.create(db.collection('orders').doc(orderId).collection('printIntents').doc('original'), {
        ...rows.get('orders/o1/printIntents/original'), orderId, catalogHash: hash(catalog), createdAt });
      plan.apply(); return plan.jobId;
    });
  };
  const http = (method = 'POST', suffix = '', body = { statusCode: '200%20OK' }, headers = {}) => route[method](
    new Request(`https://orderfly.test/api/cloudprnt/b1/l1/p1${suffix}`, { method,
      headers: { authorization: command.authorization, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...headers },
      ...(method === 'POST' ? { body: JSON.stringify(body) } : method === 'DELETE' ? { body: '', headers: { authorization: command.authorization, 'content-length': '0', ...headers } } : {}) }), { params: Promise.resolve(scope) });
  return { rows, window, db, job, draft, command, poll, download, confirm, replay, commits, reads, api, content, http, results, enqueueOther,
    failCommit(value = true) { failCommit = value; }, retry(fn) { retry = fn; } };
}

test('native purchase queue -> one immutable PNG -> explicit ack, terminal replay never enqueues again', enabled(async () => {
  const f = await fixture(), offer = await f.poll();
  assert.equal(offer.jobReady, true); assert.match(offer.jobToken, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(await f.poll(), { jobReady: false });
  assert.equal(f.rows.get(path('statusMetadata')).printHistory, 'never');
  assert.equal(f.rows.has(path('jobs', f.job.id)), true);
  const downloaded = await f.download(offer.jobToken);
  assert.equal(downloaded.payload.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(downloaded.payload.readUInt32BE(16), 576);
  assert.equal(f.rows.has(path('jobs', f.job.id)), false);
  assert.equal(f.rows.get(path('queue', 'state')).pendingCount, 0);
  assert.equal(f.rows.get(path('queue', 'state')).oldestPendingAt, null);
  assert.equal(f.rows.get(path('queue', 'state')).revision, 2);
  assert.equal(f.rows.get(path('statusMetadata')).printHistory, 'unknown');
  assert.equal(await f.replay(), false);
  await assert.rejects(f.download(offer.jobToken), /ordinary_print_conflict/);
  assert.deepEqual(await f.confirm(offer.jobToken), { outcome: 'confirmed', duplicate: false });
  const first = structuredClone(f.rows.get(path('printResults', f.job.id)));
  assert.equal(f.rows.get(path('statusMetadata')).printHistory, 'confirmed');
  assert.equal(f.rows.has(path('ordinaryState')), false);
  assert.deepEqual(await f.confirm(offer.jobToken, 'OK'), { outcome: 'confirmed', duplicate: true });
  assert.deepEqual(f.rows.get(path('printResults', f.job.id)), first);
  assert.equal(await f.replay(), false);
  assert.equal(JSON.stringify([...f.rows.values()]).includes(offer.jobToken), false);
  assert.equal(JSON.stringify([...f.rows.values()]).includes(f.draft.secret), false);
}));

test('commit failures do not return offer/bytes or leave partial transfer; SDK retry revalidates credentials', enabled(async () => {
  const f = await fixture(); f.failCommit();
  await assert.rejects(f.poll(), /COMMIT/);
  assert.equal(f.rows.has(path('ordinaryState')), false);
  f.failCommit(false); const offer = await f.poll(); f.failCommit();
  await assert.rejects(f.download(offer.jobToken), /COMMIT/);
  assert.equal(f.rows.has(path('jobs', f.job.id)), true);
  assert.equal(f.rows.has(path('originalPrintHistory', f.job.id)), false);
  assert.equal(f.rows.get(path('statusMetadata')).printHistory, 'never');
  f.failCommit(false); f.retry(rows => { rows.set(path('deviceCredentials'), { ...rows.get(path('deviceCredentials')), revokedAt: Date.now() }); });
  await assert.rejects(f.download(offer.jobToken));
  assert.equal(f.rows.has(path('jobs', f.job.id)), true);
  assert.equal(f.rows.has(path('deliveries', f.job.id)), false);
}));

test('two competing GETs yield bytes only once and a terminal original identity remains', enabled(async () => {
  const f = await fixture(), offer = await f.poll();
  const results = await Promise.allSettled([f.download(offer.jobToken), f.download(offer.jobToken)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.rows.get(path('queue', 'state')).revision, 2);
  assert.equal(f.rows.has(path('originalPrintHistory', f.job.id)), true);
}));

test('failed or uncertain acknowledgement never confirms, retries, or clears printer stop pointer', enabled(async () => {
  for (const code of ['500 Error', '220 Busy', '201 Created']) {
    const f = await fixture(), offer = await f.poll(); await f.download(offer.jobToken);
    const result = await f.confirm(offer.jobToken, code);
    assert.equal(result.outcome, code.startsWith('500') ? 'failed' : 'unknown');
    assert.equal(f.rows.has(path('printResults', f.job.id)), false);
    assert.equal(f.rows.get(path('statusMetadata')).printHistory, 'unknown');
    assert.equal(f.rows.has(path('ordinaryState')), true);
    assert.deepEqual(await f.poll(), { jobReady: false });
    await assert.rejects(f.confirm(offer.jobToken));
    assert.equal(await f.replay(), false);
  }
}));

test('cancel, wrong token, stale qualification, modified content and broken ledger stop before bytes', enabled(async () => {
  for (const mutate of [
    f => { f.rows.get('orders/o1').status = 'Canceled'; },
    f => { f.window.stopped = true; },
    f => { f.window.qualificationId = 'different'; },
    f => { f.window.expiresAt = Date.now(); },
    f => { f.rows.get(path('ordinaryDispatches', f.job.id)).payloadBase64 = Buffer.from('not png!').toString('base64'); },
    f => { f.rows.get(path('queue', 'state')).pendingCount = 9; },
    f => { f.rows.get(path('claims', f.job.id)).claimDigest = 'f'.repeat(64); },
  ]) {
    const f = await fixture(), offer = await f.poll(); mutate(f);
    await assert.rejects(f.download(offer.jobToken));
    assert.equal(f.rows.has(path('jobs', f.job.id)), true);
    assert.equal(f.rows.has(path('deliveries', f.job.id)), false);
  }
  const f = await fixture(), offer = await f.poll();
  await assert.rejects(f.download('X'.repeat(43)));
  await assert.rejects(f.confirm(offer.jobToken));
  assert.equal(f.rows.get(path('statusMetadata')).printHistory, 'never');
}));

test('manifest/catalog mutation, combo selection and pre-window jobs cannot offer', enabled(async () => {
  for (const mutate of [
    f => { f.rows.get('orders/o1').productItems[0].name = 'Changed'; },
    f => { f.rows.get('orders/o1').productItems[0].itemType = 'combo'; },
    f => { f.rows.delete('orders/o1/printIntents/original'); },
    f => { f.rows.get('orders/o1/printIntents/original').brandId = 'foreign'; },
    f => { f.window.issuedAt = Date.now(); },
    f => { f.rows.get(path('queue', 'state')).oldestPendingAt--; },
  ]) {
    const f = await fixture(); mutate(f); await assert.rejects(f.poll());
    assert.equal(f.rows.has(path('ordinaryState')), false);
    assert.equal(f.rows.has(path('claims', f.job.id)), false);
  }
}));

test('outbox rejects forged terminal binding and pending/terminal collision without writes', enabled(async () => {
  for (const mutate of [
    f => { f.rows.get(path('originalPrintHistory', f.job.id)).orderId = 'foreign'; },
    f => { f.rows.set(path('jobs', f.job.id), f.job); f.rows.get(path('queue', 'state')).pendingCount = 1;
      f.rows.get(path('queue', 'state')).oldestPendingAt = f.job.createdAt; },
  ]) {
    const f = await fixture(), offer = await f.poll(); await f.download(offer.jobToken); mutate(f);
    await assert.rejects(f.replay(), /job_conflict/);
  }
}));

test('native SDK retry uses one offered identity, and acknowledgement rollback cannot fabricate success', enabled(async () => {
  const f = await fixture(); f.retry(() => {}); const offer = await f.poll();
  assert.equal(f.commits.length, 1); await f.download(offer.jobToken); f.failCommit();
  await assert.rejects(f.confirm(offer.jobToken), /COMMIT/);
  assert.equal(f.rows.has(path('printResults', f.job.id)), false);
  assert.equal(f.rows.get(path('statusMetadata')).printHistory, 'unknown');
  assert.equal(f.rows.has(path('ordinaryState')), true);
}));

test('literal removals are rendered without an addition prefix', () => {
  const { renderKitchenReceipt } = loadTs('src/lib/printing/kitchen-receipt.ts');
  const result = renderKitchenReceipt({ orderReference: 'o1', fulfillmentLabel: 'Afhentning', fulfillmentTime: 'Nu',
    items: [{ name: 'Pizza', quantity: 1, literalModifiers: ['Uden løg'] }] }, { paperWidthMm: 80 });
  assert.match(result.text, /    Uden løg/); assert.doesNotMatch(result.text, /\+ Uden/);
});

test('actual exported HTTP route and live scoped policy negotiate one PNG and strict result', enabled(async () => {
  const f = await fixture();
  const offered = await f.http('POST', '?t=1792842465'); assert.equal(offered.status, 200);
  const body = await offered.json(); assert.equal(body.jobReady, true); assert.equal(body.deleteMethod, 'DELETE');
  const query = `?mac=00%3A11%3A22%3A33%3A44%3A55&token=${body.jobToken}`;
  const bytes = await f.http('GET', `${query}&type=image%2Fpng`);
  assert.equal(bytes.status, 200); assert.equal(bytes.headers.get('content-type'), 'image/png');
  assert.equal(bytes.headers.get('cache-control'), 'no-store');
  assert.equal(Buffer.from(await bytes.arrayBuffer()).readUInt32BE(16), 576);
  assert.equal((await f.http('GET', query)).status, 409);
  const ack = await f.http('DELETE', `${query}&code=200%20OK`); assert.equal(ack.status, 200);
  assert.equal((await f.http('DELETE', `${query}&code=OK`)).status, 200);
  assert.equal(f.rows.has(path('printResults', f.job.id)), true);
  assert.equal((await f.http('HEAD')).status, 405);
}));

test('HTTP busy/progress, malformed requests and auth rejection cannot offer or dispatch', enabled(async () => {
  const f = await fixture();
  for (const body of [{ statusCode: '220 Busy' }, { statusCode: '500 Error' },
    { statusCode: '200 OK', printingInProgress: true }, { statusCode: '200 OK', jobToken: 'old' }]) {
    const response = await f.http('POST', '', body);
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { jobReady: false });
  }
  assert.equal((await f.http('POST', '?scope=foreign')).status, 400);
  assert.equal((await f.http('POST', '', {}, { authorization: '' })).status, 401);
  assert.equal(f.rows.has(path('ordinaryState')), false);
  assert.equal(f.rows.has(path('claims', f.job.id)), false);
  f.rows.set(path('deviceCredentials'), { ...f.rows.get(path('deviceCredentials')), revokedAt: Date.now() });
  assert.equal((await f.http()).status, 401);
}));

test('authenticated polls without an active scoped window record contact but never modify print state', enabled(async () => {
  for (const mutate of [
    f => f.rows.delete(path('orderTestWindows')),
    f => { f.window.stoppedAt = Date.now(); },
    f => { f.window.issuedAt -= 3600000; f.window.expiresAt -= 3600000; },
  ]) {
    const f = await fixture(); mutate(f);
    const before = structuredClone([...f.rows]);
    const response = await f.http();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { jobReady: false });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual([...f.rows].filter(([key])=>key!==path('connection')), before);
    assert.ok(f.commits.flat().every(write=>write === path('connection')));
    const query = '?mac=00%3A11%3A22%3A33%3A44%3A55&token=' + 'A'.repeat(43);
    assert.equal((await f.http('GET', query)).status, 409);
    assert.equal((await f.http('DELETE', query + '&code=200%20OK')).status, 409);
    f.rows.set(path('deviceCredentials'), { ...f.rows.get(path('deviceCredentials')), revokedAt: Date.now() });
    assert.equal((await f.http()).status, 401, 'inactive windows never bypass device authentication');
  }
}));

test('poll fallback does not hide database failures', enabled(async () => {
  const f = await fixture(); f.rows.delete(path('orderTestWindows'));
  f.db.runTransaction = async () => { throw Error('PRIVATE_DATABASE_FAILURE'); };
  const response = await f.http();
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'poll_unavailable' });
}));

test('missing or disabled output gate stays no-job and never consumes an order', enabled(async () => {
  const f = await fixture(); delete process.env.ORDERFLY_PRINTER_ORDER_TEST_OUTPUT_ENABLED;
  const response = await f.http(); assert.equal(response.status, 200); assert.deepEqual(await response.json(), { jobReady: false });
  assert.equal(f.rows.has(path('ordinaryState')), false);
  assert.equal(f.rows.has(path('jobs', f.job.id)), true);
}));

test('saved kitchen instructions enter immutable PNG, oversized instructions reject without dropping them', enabled(async () => {
  const f = await fixture(); f.rows.get('orders/o1').customerDetails = { deliveryInstructions: 'Ingen ost. Allergi.' };
  const preview = await f.db.runTransaction(transaction => f.content.prepareOrdinaryJobContent(
    { db: f.db, transaction }, f.job, { model: 'mc-print3', paperWidthMm: 80 }));
  f.rows.get('orders/o1').customerDetails.deliveryInstructions = 'Ingen ost. Allergi. Pak separat.';
  const changed = await f.db.runTransaction(transaction => f.content.prepareOrdinaryJobContent(
    { db: f.db, transaction }, f.job, { model: 'mc-print3', paperWidthMm: 80 }));
  assert.notEqual(preview.sha256, changed.sha256);
  f.rows.get('orders/o1').customerDetails.deliveryInstructions = 'x'.repeat(401);
  await assert.rejects(f.poll()); assert.equal(f.rows.has(path('ordinaryState')), false);
}));

test('an old confirmed token replay cannot clear a newer in-flight job pointer', enabled(async () => {
  const f = await fixture(), first = await f.poll(); await f.download(first.jobToken); await f.confirm(first.jobToken);
  const secondId = await f.enqueueOther('o2'), second = await f.poll(); await f.download(second.jobToken);
  assert.equal(f.rows.get(path('ordinaryState')).jobId, secondId);
  assert.deepEqual(await f.confirm(first.jobToken), { outcome: 'confirmed', duplicate: true });
  assert.equal(f.rows.get(path('ordinaryState')).jobId, secondId);
  assert.equal(f.rows.get(path('ordinaryDispatches', secondId)).state, 'download_started');
  await f.confirm(second.jobToken); assert.equal(f.rows.has(path('ordinaryState')), false);
}));

test('direct result preparation rechecks stopped window instead of trusting wrapper authorization', enabled(async () => {
  const f = await fixture(), offer = await f.poll(); await f.download(offer.jobToken);
  f.window.stoppedAt = Date.now();
  await assert.rejects(f.db.runTransaction(transaction => f.results.prepareCloudPrntPrintConfirmation(
    { db: f.db, transaction }, { ...f.command, jobId: f.job.id,
      query: new URLSearchParams({ token: offer.jobToken, mac: '00:11:22:33:44:55', code: 'OK' }).toString() })));
  assert.equal(f.rows.has(path('printResults', f.job.id)), false);
  assert.equal(f.rows.get(path('statusMetadata')).printHistory, 'unknown');
}));
