const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const binding = { brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, credentialRevision: 1 };
const flags = { outputAuthorized: false, dispatchAuthorized: false, activationAuthorized: false, physicalCompatibilityVerified: false };
const sessionId = 'a'.repeat(43), nonce = 'b'.repeat(42) + 'A';
const attestation = () => ({ ...binding, sessionId, nonce, trust: 'supervised_operator', operatorId: 'onsite1',
  physicalDeviceIdentified: true, nativeEnrollmentCorrelated: true, method: 'stario_firmware_query', model: 'mc-print3',
  labelSku: 'MCP31LB', firmware: '3.2', captureDigest: 'c'.repeat(64), paperWidthMm: 80, rasterWidthDots: 576,
  transport: 'cloudprnt-http', mediaType: 'image/png' });
function fixture(options = {}) {
  const events = [];
  const qualification = loadTs('src/lib/printing/pilot-qualification.ts', { 'server-only': {} });
  const mocks = { 'server-only': {}, '@/lib/access/authority': authority,
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => {
      events.push('auth'); if (options.denied) throw new authority.AuthorityError('PRIVATE', options.denied);
    } }, '@/lib/url': { getOrigin: async () => 'https://orderfly.dk' },
    './pilot-qualification': { ...qualification, issuePilotQualificationSession: async scope => {
      events.push(['issue', scope]);
      if (options.code) throw new qualification.PilotQualificationError(options.code);
      if (options.error) throw options.error;
      const result = Object.defineProperty({ ...binding, sessionId, expiresAt: Date.now() + 600000, ...flags }, 'nonce', { value: nonce });
      return options.result === undefined ? result : options.result;
    } }, './pilot-qualification-consumption': { consumePilotQualification: async input => {
      events.push(['consume', input]); if (options.error) throw options.error;
      return options.result === undefined ? { ...binding, sessionId, jobId: sessionId, contentDigest: 'c'.repeat(64), trust: 'supervised_operator', ...flags } : options.result;
    } } };
  const handler = loadTs('src/lib/printing/pilot-control-http.ts', mocks);
  const route = loadTs('src/app/api/superadmin/printers/pilot/route.ts', { 'server-only': {}, '@/lib/printing/pilot-control-http': handler });
  async function request(body = { operation: 'issue', ...binding }, config = {}) {
    const req = new Request(`https://orderfly.dk/api/superadmin/printers/pilot${config.query || ''}`, {
      method: config.method || 'POST', headers: { origin: 'https://orderfly.dk', 'content-type': 'application/json', ...config.headers },
      body: config.raw === undefined ? JSON.stringify(body) : config.raw,
    });
    const response = await route.POST(req);
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('vary'), 'Cookie');
    return { status: response.status, body: await response.json() };
  }
  return { events, request, handler, qualification };
}

test('actual route issues once, explicitly projects nonenumerable nonce and never grants output', async () => {
  const f = fixture(), result = await f.request();
  assert.equal(result.status, 201); assert.equal(result.body.nonce, nonce); assert.equal(result.body.sessionId, sessionId);
  assert.equal(f.events[0], 'auth'); assert.equal(f.events.filter(x => Array.isArray(x)).length, 1);
  assert.deepEqual(f.events[1], ['issue', binding]);
  for (const key of Object.keys(flags)) assert.equal(result.body[key], false);
});
test('actual route consumes once with strict attestation and projects only one job linkage', async () => {
  const f = fixture(), a = attestation(), result = await f.request({ operation: 'attest', attestation: a });
  assert.equal(result.status, 201); assert.equal(result.body.jobId, sessionId); assert.equal(result.body.nonce, undefined);
  assert.deepEqual(f.events, ['auth', ['consume', a]]);
});
test('auth precedes poisoned request; unauthorized response no-store without body inspection', async () => {
  const f = fixture({ denied: 401 });
  const response = await f.handler.postPrinterPilotControl({ get headers() { throw Error('poison'); } });
  assert.equal(response.status, 401); assert.deepEqual(await response.json(), { error: 'unauthorized' });
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.deepEqual(f.events, ['auth']);
});
test('CSRF, method, query, media, strict input and streamed bounds reject before service', async () => {
  const cases = [
    [undefined, { headers: { origin: 'https://foreign.invalid' } }, 403],
    [undefined, { headers: { 'sec-fetch-site': 'cross-site' } }, 403],
    [undefined, { query: '?extra=1' }, 400], [undefined, { method: 'PUT' }, 400],
    [undefined, { headers: { 'content-type': 'text/plain' } }, 400],
    [undefined, { raw: 'x'.repeat(8193), headers: { 'content-length': '1' } }, 400],
    [undefined, { raw: '{broken' }, 400], [{ operation: 'issue', ...binding, outputAuthorized: true }, {}, 400],
    [{ operation: 'attest', attestation: { ...attestation(), nonce: 'invalid' } }, {}, 400],
  ];
  for (const [body, config, expected] of cases) {
    const f = fixture(), result = await f.request(body, config); assert.equal(result.status, expected);
    assert.deepEqual(f.events, ['auth']);
  }
});
test('native conflicts map safely; unknown commit/errors never reflect nonce or provider text', async () => {
  for (const [options, status] of [[{ code: 'qualification_conflict' }, 409], [{ code: 'invalid_qualification' }, 400],
    [{ code: 'qualification_unavailable' }, 503], [{ error: Error(`PRIVATE ${nonce}`) }, 503]]) {
    const f = fixture(options), result = await f.request(); assert.equal(result.status, status);
    assert.equal(JSON.stringify(result.body).includes('PRIVATE'), false); assert.equal(JSON.stringify(result.body).includes(nonce), false);
  }
});
test('unexpected service result, foreign scope, accessor and secret leakage fail closed', async () => {
  const base = { ...binding, sessionId, expiresAt: Date.now() + 600000, ...flags, nonce };
  for (const result of [{ ...base, brandId: 'foreign' }, { ...base, payload: 'PRIVATE' }, { ...base, outputAuthorized: true },
    { ...base, get nonce() { throw Error('PRIVATE'); } }, { ...base, nonce: 'x'.repeat(43) }, null]) {
    const f = fixture({ result }), response = await f.request(); assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: 'qualification_unavailable' });
  }
  const f = fixture({ result: { ...binding, sessionId, jobId: 'd'.repeat(43), contentDigest: 'c'.repeat(64), trust: 'supervised_operator', ...flags } });
  assert.equal((await f.request({ operation: 'attest', attestation: attestation() })).status, 503);
});

test('one-click POST accepts only scoped request ID and enforces CSRF/auth and projected response',async()=>{
  const events=[];
  const api=loadTs('src/lib/printing/pilot-control-http.ts',{'server-only':{},
    '@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>events.push('auth')},
    '@/lib/url':{getOrigin:async()=>'https://orderfly.dk'},
    './direct-test-print':{requestDirectTestPrint:async input=>{events.push(input);return {...binding,jobId:sessionId,physicalCompatibilityVerified:false};}}
  });
  const command={...binding,operation:'print',requestId:sessionId};
  const send=(body,origin='https://orderfly.dk')=>api.postPrinterPilotControl(new Request('https://orderfly.dk/api/superadmin/printers/pilot',{
    method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}));
  assert.equal((await send(command)).status,201);assert.deepEqual(events[1],{...binding,requestId:sessionId});
  assert.equal((await send({...command,firmware:'5.4'})).status,400);
  assert.equal((await send({...command,requestId:'bad'})).status,400);
  assert.equal((await send(command,'https://other.invalid')).status,403);
  assert.equal(events.filter(x=>typeof x==='object').length,1);
});
