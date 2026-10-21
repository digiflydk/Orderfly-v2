const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const p = loadTs('src/lib/printing/cloudprnt-http.ts');
const { createCloudPrntSimulator } = require('../helpers/cloudprnt-simulator.cjs');
const mac = '00:11:e5:06:04:ff';
const poll = patch => JSON.stringify({ statusCode: '200%20OK', printerMAC: mac, ...patch });
const post = (sim, patch) => sim.request({ method: 'POST', body: poll(patch) });
const query = patch => new URLSearchParams({ mac, token: 'fixture-job-1', ...patch }).toString();
const make = () => createCloudPrntSimulator({ mac });

test('official poll sample and optional/null fields parse without copying peripheral payloads', () => {
  const sample = p.parseCloudPrntPoll(poll({ status: '23 6 0 0 0 0 0 0 0 ', clientAction: null, barcodeReader: [{ scan: 'private' }] }), 'application/json');
  assert.equal(sample.status.kind, 'online');
  assert.equal(sample.printerMAC, mac);
  assert.equal(sample.printingInProgress, null);
  assert.equal('barcodeReader' in sample, false);
  assert.equal('status' in sample, true);
  for (const optional of [{}, { printerMAC: null, uniqueID: null, status: null, printingInProgress: null, jobToken: null }]) {
    const parsed = p.parseCloudPrntPoll(JSON.stringify({ statusCode: '200', ...optional }), 'application/json; charset=utf-8');
    assert.equal(parsed.jobToken, null);
  }
});

test('malformed, oversized, incorrect types and wrong content types are rejected', () => {
  for (const raw of ['', '{', 'null', '[]', '{}', '"200"', ' '.repeat(8193), poll({ statusCode: null }), poll({ statusCode: '200%2520OK' }), poll({ statusCode: '%E0%A4%A' }), poll({ statusCode: '200\nOK' }), poll({ printerMAC: 'not-mac' }), poll({ printingInProgress: 'false' }), poll({ jobToken: '../job' })]) {
    assert.throws(() => p.parseCloudPrntPoll(raw, 'application/json'), /invalid_poll/);
  }
  for (const type of ['text/plain', 'application/jsonx', 'application/json; charset=iso-8859-1']) {
    assert.throws(() => p.parseCloudPrntPoll(poll(), type), /invalid_poll/);
  }
});

test('3/4-digit printer statuses are distinct from HTTP status, busy and unknown remain conservative', () => {
  for (const code of ['410 Out of paper', '499 Future printer error', '511 Media Decoding Error', '1202 Already used']) {
    assert.equal(p.parseCloudPrntPoll(poll({ statusCode: encodeURIComponent(code) }), 'application/json').status.kind, 'reported_error');
  }
  assert.equal(p.parseCloudPrntPoll(poll({ statusCode: '220%20Printing' }), 'application/json').status.kind, 'busy');
  assert.equal(p.parseCloudPrntPoll(poll({ statusCode: '999 Unknown' }), 'application/json').status.kind, 'unknown');
});

test('poll response includes actual media and token only for available ready job', () => {
  const ready = p.parseCloudPrntPoll(poll(), 'application/json');
  assert.deepEqual(p.cloudPrntPollResponse(ready), { jobReady: false });
  const job = { jobToken: 'job-1', mediaTypes: ['image/png', 'text/plain'] };
  assert.deepEqual(p.cloudPrntPollResponse(ready, job), { jobReady: true, ...job, deleteMethod: 'DELETE' });
  for (const patch of [{ printingInProgress: true }, { jobToken: 'old-job' }, { statusCode: '220 Busy' }, { statusCode: '420 Cover open' }, { statusCode: '999 Unknown' }]) {
    assert.deepEqual(p.cloudPrntPollResponse(p.parseCloudPrntPoll(poll(patch), 'application/json'), job), { jobReady: false });
  }
  for (const invalid of [{ jobToken: 'x', mediaTypes: [] }, { ...job, mediaTypes: ['text/plain', 'text/plain'] }, { ...job, mediaTypes: ['application/vnd.star.starconfiguration'] }, { ...job, secret: 'no' }]) {
    assert.throws(() => p.cloudPrntPollResponse(ready, invalid), /invalid_job/);
  }
});

test('job query negotiates supported format with preferred-format fallback and canonical MAC', () => {
  assert.equal(p.parseCloudPrntJobQuery(query()).mediaType, null);
  assert.equal(p.parseCloudPrntJobQuery(query({ type: 'image/png' })).mediaType, 'image/png');
  assert.equal(p.parseCloudPrntJobQuery(query({ mac: mac.toUpperCase() })).mac, mac);
});

test('queries reject duplicate, foreign operation, legacy tokenless, malformed and oversized parameters', () => {
  for (const raw of [query() + '&token=another', query({ delete: 'true' }), 'mac=' + mac, query({ type: 'image/gif' }), query() + '&bogus=1', query() + '&uid=%ZZ', 'x'.repeat(2049), query({ token: 'x'.repeat(129) })]) {
    assert.throws(() => p.parseCloudPrntJobQuery(raw), /invalid_query/);
  }
});

test('confirmation statuses distinguish explicit success, reported failure and unknown outcome', () => {
  for (const code of ['200 OK', '200', 'OK']) assert.equal(p.parseCloudPrntConfirmation(query({ code })).outcome, 'confirmed');
  for (const code of ['410 Out of paper', '511 Media Decoding Error', '1202 Already used']) assert.equal(p.parseCloudPrntConfirmation(query({ code })).outcome, 'reported_failure');
  for (const code of ['220 Printing', '299 Future status', '999 Unknown']) assert.equal(p.parseCloudPrntConfirmation(query({ code })).outcome, 'uncertain');
  assert.equal(p.parseCloudPrntConfirmation(query({ code: '200 OK', retry: '5' })).retry, 5);
  for (const raw of [query(), query({ code: '200%20OK' }), query({ code: '200 OK', retry: '-1' }), query({ code: '200 OK', retry: '1e2' }), query({ code: '200 OK' }) + '&code=511']) {
    assert.throws(() => p.parseCloudPrntConfirmation(raw), /invalid_query/);
  }
});

test('simulated POST/GET/DELETE success, GET idempotence and duplicate confirmation', () => {
  const sim = make();
  assert.equal(sim.request({ method: 'GET', query: query() }).status, 404);
  const offer = post(sim);
  assert.equal(offer.headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(offer.body).jobToken, 'fixture-job-1');
  const first = sim.request({ method: 'GET', query: query({ type: 'text/plain' }) });
  assert.equal(first.status, 200);
  assert.equal(first.headers['Content-Type'], 'text/plain');
  assert.ok(Buffer.isBuffer(first.body));
  assert.deepEqual(sim.request({ method: 'GET', query: query() }).body, first.body);
  assert.equal(sim.state, 'awaiting_result');
  const completion = sim.request({ method: 'DELETE', query: query({ code: '200 OK' }) });
  assert.equal(completion.status, 200);
  assert.equal(completion.body, '');
  assert.equal(sim.state, 'confirmed');
  assert.equal(sim.request({ method: 'DELETE', query: query({ code: '200 OK', retry: '1' }) }).status, 200);
  assert.equal(sim.request({ method: 'DELETE', query: query({ code: '511 Decode failure' }) }).status, 409);
  assert.equal(JSON.parse(post(sim).body).jobReady, false);
});

test('simulator does not release other identity/token or unsupported content', () => {
  const sim = make();
  assert.equal(post(sim, { printerMAC: '00:11:e5:06:04:00' }).status, 404);
  post(sim);
  for (const patch of [{ token: 'other' }, { mac: '00:11:e5:06:04:00' }]) {
    assert.equal(sim.request({ method: 'GET', query: query(patch) }).status, 404);
    assert.equal(sim.request({ method: 'DELETE', query: query({ ...patch, code: '200 OK' }) }).status, 404);
  }
  assert.equal(sim.request({ method: 'GET', query: query({ type: 'image/png' }) }).status, 415);
  assert.equal(sim.state, 'awaiting_result');
});

test('missing result and subsequent idle poll never confirm/requeue or produce a second offer', () => {
  const sim = make();
  post(sim); sim.request({ method: 'GET', query: query() });
  assert.equal(JSON.parse(post(sim, { printingInProgress: false, jobToken: null }).body).jobReady, false);
  assert.equal(sim.state, 'awaiting_result');
  sim.loseResult();
  assert.equal(sim.state, 'uncertain');
  assert.equal(JSON.parse(post(sim).body).jobReady, false);
  assert.equal(sim.request({ method: 'GET', query: query() }).status, 404);
  assert.equal(sim.request({ method: 'DELETE', query: query({ code: '200 OK', retry: '5' }) }).status, 200);
  assert.equal(sim.state, 'confirmed');
});

test('reported errors block retry even after ready status returns; explicit result is retained', () => {
  const sim = make(); post(sim);
  assert.equal(JSON.parse(post(sim, { jobToken: 'fixture-job-1', statusCode: '410 Out of paper' }).body).jobReady, false);
  assert.equal(sim.state, 'reported_failure');
  assert.equal(JSON.parse(post(sim).body).jobReady, false);
  assert.equal(sim.request({ method: 'GET', query: query() }).status, 404);
  assert.equal(sim.request({ method: 'DELETE', query: query({ code: '511 Decode error' }) }).status, 200);
  assert.equal(sim.state, 'reported_failure');
});

test('only documented family widths classify status; unknown DELETE results remain uncertain', () => {
  for (const code of ['199 Future', '2999 Future', '4999 Future', '5999 Future']) {
    const parsed = p.parseCloudPrntPoll(poll({ statusCode: code }), 'application/json');
    assert.equal(parsed.status.kind, 'unknown');
    assert.deepEqual(p.cloudPrntPollResponse(parsed, { jobToken: 'job-1', mediaTypes: ['text/plain'] }), { jobReady: false });
    assert.equal(p.parseCloudPrntConfirmation(query({ code })).outcome, 'uncertain');
    const sim = make(); post(sim);
    assert.equal(sim.request({ method: 'DELETE', query: query({ code }) }).status, 200);
    assert.equal(sim.state, 'uncertain');
    assert.equal(JSON.parse(post(sim).body).jobReady, false);
    assert.equal(sim.request({ method: 'GET', query: query() }).status, 404);
  }
  for (const code of ['1000', '1202', '1999', '499', '599']) {
    assert.equal(p.parseCloudPrntConfirmation(query({ code })).outcome, 'reported_failure');
  }
});

test('mC-Print2/3 subset never advertises or accepts incompatible Star raster commands', () => {
  const ready = p.parseCloudPrntPoll(poll(), 'application/json');
  assert.deepEqual(p.cloudPrntMediaTypes, ['image/png', 'text/plain']);
  assert.throws(() => p.cloudPrntPollResponse(ready, { jobToken: 'job-1', mediaTypes: ['application/vnd.star.raster'] }), /invalid_job/);
  assert.throws(() => p.parseCloudPrntJobQuery(query({ type: 'application/vnd.star.raster' })), /invalid_query/);
});

test('HTTP-shaped harness rejects malformed polls and methods without mutating queued state', () => {
  const sim = make();
  assert.equal(sim.request({ method: 'POST', body: '{}'}).status, 400);
  assert.equal(sim.request({ method: 'PATCH' }).status, 405);
  assert.equal(sim.request({ method: 'DELETE', query: query({ code: '200 OK' }) }).status, 409);
  assert.equal(sim.state, 'queued');
});
