const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { actorId, policy: basePolicy } = require('../helpers/printing-fixture.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const schema = loadTs('src/lib/printing/brand-automatic-print-schema.ts');
const setting = 'brands/brand/printSettings/automatic', now = 1_800_000_000_000;
function fixture() {
  const policy = basePolicy();
  policy.roles.push({ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  policy.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true });
  const records = new Map([['platformAdminControl/access-v1', policy], ['brands/brand', { id: 'brand', status: 'active' }]]);
  const options = {}, events = [], commits = [];
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  let retried = false;
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), async runTransaction(run) {
    events.push('transaction');
    for (;;) {
      const staged = new Map(structuredClone([...records])), writes = []; let writing = false;
      const put = (r, value, create) => { writing = true;
        if (options.failAudit && r.path.includes('/printSettingsAudit/')) throw Error('PRIVATE audit error');
        if (create) assert.equal(staged.has(r.path), false);
        staged.set(r.path, structuredClone(value)); writes.push(r.path);
      };
      const value = await run({ get: async r => { assert.equal(writing, false, 'all authorization reads precede writes');
        return { id: r.id, exists: staged.has(r.path), data: () => structuredClone(staged.get(r.path)) }; },
        set: (r,v) => put(r,v,false), create: (r,v) => put(r,v,true) });
      if (options.retry && !retried) { retried = true; options.retry(records); continue; }
      if (options.failCommit) throw Error('PRIVATE commit error');
      records.clear(); for (const row of staged) records.set(...row); commits.push(writes); return value;
    }
  } };
  const mocks = { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db }, '@/lib/access/authority': authority,
    './authority': authority, './brand-automatic-print-schema': schema,
    '@/lib/url': { getOrigin: async () => 'https://orderfly.test' },
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => {
      events.push('auth'); if (options.denied) throw new authority.AuthorityError('PRIVATE auth', options.denied);
      return { identity: { provider: 'firebase', subject: 'writer' } };
    } } };
  const service = loadTs('src/lib/printing/brand-automatic-print.ts', mocks);
  const http = loadTs('src/lib/printing/brand-automatic-print-http.ts', { ...mocks, './brand-automatic-print': service });
  return { records, options, events, commits, service,
    save: (enabled = true, expectedRevision = 0) => service.controlBrandAutomaticPrint({ brandId: 'brand', enabled, expectedRevision }, true),
    async run(request = req()) { const response = await http.handleBrandAutomaticPrint(request);
      assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('vary'), 'Cookie');
      const body = await response.json(); assert.doesNotMatch(JSON.stringify(body), /PRIVATE|activationId|actorId/);
      return { status: response.status, body };
    } };
}
function req(method = 'POST', options = {}) {
  return new Request(`https://orderfly.test/api/superadmin/printers/automatic-print${options.query ?? (method === 'GET' ? '?brandId=brand' : '')}`, {
    method, headers: { origin: 'https://orderfly.test', 'content-type': 'application/json', ...options.headers },
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: options.raw ?? JSON.stringify(options.body ?? { brandId: 'brand', enabled: true, expectedRevision: 0 }) }),
    ...(options.raw instanceof ReadableStream ? { duplex: 'half' } : {}),
  });
}
async function enabled(run) {
  const names = ['ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED', 'ORDERFLY_PRINT_INTENTS_ENABLED'];
  const old = names.map(name => process.env[name]), clock = Date.now;
  names.forEach(name => process.env[name] = 'true'); Date.now = () => now;
  try { await run(); } finally { names.forEach((name,index) => { if (old[index] === undefined) delete process.env[name]; else process.env[name] = old[index]; }); Date.now = clock; }
}

test('automatic settings authorize before request inspection and reauthorize current policy on transaction retry', () => enabled(async () => {
  for (const denied of [401,403]) {
    const f = fixture(); f.options.denied = denied;
    assert.equal((await f.run(new Proxy({}, { get() { throw Error('PRIVATE request inspected'); } }))).status, denied);
    assert.deepEqual(f.events, ['auth']); assert.equal(f.commits.length, 0);
  }
  const f = fixture(); f.options.retry = records => { records.get('platformAdminControl/access-v1').roles = []; };
  assert.equal((await f.run()).status, 403); assert.equal(f.records.has(setting), false); assert.equal(f.commits.length, 0);
  assert.equal([...f.records.keys()].some(key => key.includes('/printSettingsAudit/')), false);
}));

test('automatic settings audit/commit failures roll back the setting; concurrent revision update wins', () => enabled(async () => {
  for (const failure of ['failAudit','failCommit']) {
    const f = fixture(); f.options[failure] = true;
    assert.deepEqual(await f.run(), { status:503, body:{ error:'automatic_print_unavailable' } });
    assert.equal(f.records.has(setting), false); assert.equal([...f.records.keys()].some(key => key.includes('/printSettingsAudit/')), false);
  }
  const f = fixture(); f.options.retry = records => records.set(setting, { schemaVersion:1,brandId:'brand',enabled:false,revision:1,enabledAt:null,activationId:null,updatedAt:now });
  assert.equal((await f.run()).status,409); assert.equal(f.records.get(setting).enabled,false);
  assert.equal(f.commits.length,0);
}));

test('automatic settings reject foreign/deleted/corrupt brands and records, strict commands and disabled write gates', () => enabled(async () => {
  for (const mutate of [r=>r.delete('brands/brand'), r=>r.get('brands/brand').id='foreign', r=>r.get('brands/brand').deletedAt=now,
    r=>r.get('brands/brand').isTestData=true, r=>r.get('brands/brand').status='suspended',
    r=>r.set(setting,{schemaVersion:1,brandId:'foreign',enabled:false,revision:1,enabledAt:null,activationId:null,updatedAt:now}),
    r=>r.set(setting,{schemaVersion:1,brandId:'brand',enabled:true,revision:1,enabledAt:now,activationId:null,updatedAt:now}),
    r=>r.set(setting,{schemaVersion:1,brandId:'brand',enabled:false,revision:1,enabledAt:null,activationId:null,updatedAt:now+1})]) {
    const f=fixture(); mutate(f.records); assert.ok([409,503].includes((await f.run()).status)); assert.equal(f.commits.length,0);
  }
  for (const body of [null,[],{brandId:'../brand',enabled:true,expectedRevision:0},{brandId:'brand',enabled:'true',expectedRevision:0},
    {brandId:'brand',enabled:true,expectedRevision:-1},{brandId:'brand',enabled:true,expectedRevision:0,actorId:'other'}]) {
    const f=fixture(); assert.equal((await f.run(req('POST',{raw:JSON.stringify(body)}))).status,400); assert.equal(f.commits.length,0);
  }
  for (const name of ['ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED','ORDERFLY_PRINT_INTENTS_ENABLED']) {
    delete process.env[name]; const f=fixture(); assert.ok([409,503].includes((await f.run()).status)); assert.equal(f.records.has(setting),false); process.env[name]='true';
  }
}));

test('automatic settings HTTP validates origin, query, content encoding, JSON and actual streamed body bytes', () => enabled(async () => {
  for (const headers of [{origin:''},{origin:'https://foreign.test'},{'sec-fetch-site':'cross-site'}]) {
    const f=fixture(); assert.equal((await f.run(req('POST',{headers}))).status,403); assert.equal(f.events.includes('transaction'),false);
  }
  for (const options of [{query:'?brandId=brand'},{headers:{'content-type':'text/plain'}},{headers:{'content-type':'application/json; charset=latin1'}},
    {headers:{'content-encoding':'gzip'}},{raw:'{'},{raw:Buffer.from([0xff])}]) {
    const f=fixture(); assert.equal((await f.run(req('POST',options))).status,400); assert.equal(f.events.includes('transaction'),false);
  }
  for (const query of ['', '?brandId=brand&brandId=other','?brandId=brand&extra=x','?brandId=../other','?brandId=']) {
    const f=fixture(); assert.equal((await f.run(req('GET',{query}))).status,400); assert.equal(f.events.includes('transaction'),false);
  }
  let cancelled=false;
  const raw=new ReadableStream({start(controller){controller.enqueue(Buffer.alloc(2049,32));},cancel(){cancelled=true;}});
  const f=fixture(); assert.equal((await f.run(req('POST',{raw,headers:{'content-length':'1'}}))).status,400);
  assert.equal(cancelled,true); assert.equal(f.events.includes('transaction'),false);
  const unsupported=fixture(); assert.equal((await unsupported.run(req('DELETE'))).status,405); assert.equal(unsupported.events.includes('transaction'),false);
  const valid=fixture(); assert.equal((await valid.run(req('POST',{headers:{'content-type':'application/json; charset=utf-8','content-encoding':'identity'}}))).status,200);
  assert.deepEqual((await valid.run(req('GET'))).body,{brandId:'brand',enabled:true,revision:1,enabledAt:now});
}));
