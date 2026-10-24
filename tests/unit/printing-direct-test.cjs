const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { record, path, actorId, policy: basePolicy } = require('../helpers/printing-fixture.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const scope = { brandId: 'brand', locationId: 'location', printerId: 'p1', printerRevision: 1, credentialRevision: 1 };
const credentialPath = `${path}/deviceCredentials/current`;
function fixture() {
  const policy = basePolicy();
  policy.roles.push({ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  policy.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true });
  const printer = record(); printer.configuration.state = 'active';
  const records = new Map([['platformAdminControl/access-v1', policy], ['brands/brand', { status: 'active' }],
    ['locations/location', { brandId: 'brand' }], [path, printer],
    [credentialPath, { schemaVersion: 1, ...scope, secretDigest: 'a'.repeat(64), issuedAt: 1, revokedAt: null }]]);
  const options = {}, commits = [], reads = [];
  const ref = path => ({ path, id: path.split('/').at(-1), collection: name => ({ doc: id => ref(`${path}/${name}/${id}`) }) });
  let dbCalls = 0, retried = false;
  const db = { collection: name => ({ doc: id => ref(`${name}/${id}`) }), async runTransaction(run) {
    for (;;) {
      const staged = new Map(structuredClone([...records])), writes = []; let writing = false;
      const put = (r, value, create) => {
        writing = true;
        if (options.failAudit && r.path.endsWith('-consume')) throw Error('PRIVATE');
        if (create) assert.equal(staged.has(r.path), false);
        staged.set(r.path, structuredClone(value)); writes.push(r.path);
      };
      const result = await run({ async get(r) { assert.equal(writing, false, 'all reads before writes'); reads.push(r.path);
        return { id: r.id, exists: staged.has(r.path), data: () => structuredClone(staged.get(r.path)) }; },
        create: (r, value) => put(r, value, true), set: (r, value) => put(r, value, false) });
      if (options.retry && !retried) { retried = true; options.retry(records); continue; }
      if (options.failCommit) throw Error('PRIVATE');
      records.clear(); for (const row of staged) records.set(...row); commits.push(writes);
      if (options.unknownCommit) throw Error('PRIVATE');
      return result;
    }
  } };
  const mocks = { 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => { dbCalls++; return db; } },
    '@/lib/access/authority': authority, './authority': authority,
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => {
      if (options.denied) throw new authority.AuthorityError('forbidden');
      return { identity: { provider: 'firebase', subject: 'writer' } };
    } } };
  
  const consumer = loadTs('src/lib/printing/direct-test-print.ts', mocks);
  records.set(`${path}/connection/current`, { schemaVersion: 1, ...scope, endpoint: 'test', lastSeenAt: Date.now() });
  const content = loadTs('src/lib/printing/job-content.ts', { 'server-only': {} });
  async function enabled(run, flag = true) {
    const names = ['ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED','ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED'];
    const old = names.map(n=>process.env[n]); names.forEach(n=>process.env[n]=flag?'true':'false');
    try { return await run(); } finally { names.forEach((n,i)=>old[i]===undefined?delete process.env[n]:process.env[n]=old[i]); }
  }
  return { records, reads, options, commits, consumer, content, get dbCalls() { return dbCalls; },
    print: (requestId = 'a'.repeat(43), flag = true) => enabled(() => consumer.requestDirectTestPrint({ ...scope, requestId }), flag) };

}

test('one click creates canonical job and truthful request audit without attestation; retries/double clicks reuse it', async () => {
  const f=fixture(), result=await f.print();
  assert.equal(result.jobId,'a'.repeat(43));
  const saved=f.records.get(`${path}/pilotQualifications/${result.jobId}`);
  assert.equal(saved.trust,'admin_test_request'); assert.equal(saved.physicalCompatibilityVerified,false);
  assert.equal('firmware' in saved,false); assert.equal('captureDigest' in saved,false);
  assert.equal(f.records.get(`${path}/pilotJobs/${result.jobId}`).state,'queued');
  assert.deepEqual(await f.print(),result); assert.deepEqual(await f.print('b'.repeat(43)),result);
  assert.equal([...f.records.keys()].filter(k=>k.includes('/pilotJobs/')).length,1);
  // A concurrent request alias remains idempotent even after the current job expires.
  f.records.get(`${path}/connection/current`).lastSeenAt=Date.now();
  assert.deepEqual(await f.print('b'.repeat(43)),result);
});
test('inactive/foreign/stale/revoked/offline/live endpoint cannot queue; gate off and denied actor reject', async () => {
  for(const mutate of [r=>r.get(path).configuration.state='disabled',r=>r.get('locations/location').brandId='foreign',
    r=>r.get(path).revision++,r=>r.get(credentialPath).revokedAt=Date.now(),
    r=>r.get(`${path}/connection/current`).lastSeenAt=1,r=>r.get(`${path}/connection/current`).endpoint='live',
    r=>r.get('platformAdminControl/access-v1').memberships.at(-1).active=false]) {
    const f=fixture();mutate(f.records);await assert.rejects(f.print());assert.equal(f.commits.length,0);
  }
  const f=fixture();await assert.rejects(f.print(undefined,false),/qualification_unavailable/);assert.equal(f.dbCalls,0);
  f.options.denied=true;await assert.rejects(f.print(),/forbidden/);assert.equal(f.dbCalls,0);
});
test('transaction retries recheck credential and audit failure rolls back; lost response cannot duplicate', async () => {
  const f=fixture();f.options.retry=r=>r.get(credentialPath).revokedAt=Date.now();await assert.rejects(f.print());assert.equal(f.commits.length,0);
  const a=fixture();a.options.failAudit=true;await assert.rejects(a.print(),/qualification_unavailable/);assert.equal(a.commits.length,0);
  const b=fixture();b.options.unknownCommit=true;await assert.rejects(b.print(),/qualification_unavailable/);
  b.options.unknownCommit=false;await b.print();assert.equal([...b.records.keys()].filter(k=>k.includes('/pilotJobs/')).length,1);
});
test('uncertain delivery is never automatically replaced, while an expired undownloaded job can be replaced',async()=>{
  const f=fixture();const a=await f.print(), job=f.records.get(`${path}/pilotJobs/${a.jobId}`);
  const now=Date.now(); job.state='download_started';job.tokenDigest='a'.repeat(64);job.offeredAt=now;job.downloadStartedAt=now;
  assert.equal((await f.print('b'.repeat(43))).jobId,a.jobId);
  const clock=Date.now;Date.now=()=>now+700000;
  try { f.records.get(`${path}/connection/current`).lastSeenAt=Date.now();assert.equal((await f.print('c'.repeat(43))).jobId,a.jobId); }
  finally {Date.now=clock;}
  const g=fixture(), original=await g.print();const j=g.records.get(`${path}/pilotJobs/${original.jobId}`);
  Date.now=()=>j.expiresAt+1;
  try {g.records.get(`${path}/connection/current`).lastSeenAt=Date.now();assert.notEqual((await g.print('d'.repeat(43))).jobId,original.jobId);}
  finally {Date.now=clock;}
});
