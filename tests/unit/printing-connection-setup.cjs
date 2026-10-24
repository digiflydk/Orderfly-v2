const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { config, record, path, actorId, policy: companyPolicy } = require('../helpers/printing-fixture.cjs');
const authority = loadTs('src/lib/access/authority.ts', { 'server-only': {} });
const crypto = loadTs('src/lib/printing/device-auth.ts', { 'server-only': {} });
const setupPath = 'locations/location/printers/prn_fixed';
const command = (patch = {}) => ({brandId:'brand',locationId:'location',name:'Køkken',description:'Pizza',manufacturer:'star',model:'mc-print3',paperWidthMm:80,...patch});
function superPolicy() { const p = companyPolicy(); p.roles.push({ id: 'owner', name: 'Owner', companyId: null, kind: 'superuser', permissions: [], active: true });
  p.memberships.push({ id: 'owner', principalId: actorId, companyId: null, locationIds: null, roleIds: ['owner'], active: true }); return p; }
function fixture(options = {}) {
  const records = new Map([['platformAdminControl/access-v1', superPolicy()], ['brands/brand', { status: 'active' }],
    ['locations/location', { brandId: 'brand' }], ...(options.extra || [])]);
  const events = [], commits = [], generated = []; let staged, writes, writing, retried = false, queue = Promise.resolve(), dbCalls = 0;
  const collection = path => ({doc:id=>ref(`${path}/${id}`),limit:n=>({query:path,limit:n})});
  const ref = path => ({path,id:path.split('/').at(-1),collection:name=>collection(`${path}/${name}`)});
  // SDK reuses the same Transaction object after resetting its per-attempt state.
  const tx = { async get(ref) { assert.equal(writing, false); events.push(ref.path || ref.query); if(ref.query) return {empty:![...staged.keys()].some(k=>k.startsWith(ref.query+'/'))}; return { id: ref.id, exists: staged.has(ref.path), data: () => structuredClone(staged.get(ref.path)) }; },
    create(ref, row) { writing = true; if (options.failAudit && ref.path.includes('/deviceCredentialAudit/')) throw Error('PRIVATE audit failure');
      if (staged.has(ref.path)) throw Error('PRIVATE conflict'); writes.push(['create', ref.path, structuredClone(row)]); staged.set(ref.path, structuredClone(row)); },
    set(ref, row) { writing = true; writes.push(['set', ref.path, structuredClone(row)]); staged.set(ref.path, structuredClone(row)); } };
  const db = { collection, runTransaction(run) {
    const pending = queue.then(async () => { for (;;) { staged = new Map(structuredClone([...records])); writes = []; writing = false;
      const result = await run(tx); assert.equal(Object.getOwnPropertyDescriptor(result, 'secret'), undefined, 'transaction callback must never return plaintext');
      if (options.retry && !retried) { retried = true; options.retry(records); continue; }
      if (options.beforeCommit) await options.beforeCommit(staged);
      records.clear(); for (const row of staged) records.set(...row); commits.push(writes);
      if (options.afterCommitError) throw Error('PRIVATE unknown commit'); return result;
    }}); queue = pending.catch(() => {}); return pending;
  }};
  const session = { identity: { provider: 'firebase', subject: 'writer' }, superuser: true };
  const service = loadTs('src/lib/printing/connection-setup.ts', {
    'node:crypto': {...require('node:crypto'),randomUUID:()=> 'fixed'}, 'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => { dbCalls++; return db; } },
    '@/lib/access/orderfly-session': { requirePlatformSuperuser: async () => { if (options.denied) throw new authority.AuthorityError('forbidden'); return session; } },
    '@/lib/access/authority': authority, './authority': authority,
    './device-auth': { ...crypto, createPrinterDeviceCredentialDraft: input => {
      if (options.draftFailure) throw Error('PRIVATE entropy provider unavailable');
      const draft = crypto.createPrinterDeviceCredentialDraft(input); generated.push(draft); return draft;
    } },
    'firebase-admin/firestore': { FieldValue: { serverTimestamp: () => ({ serverTimestamp: true }) } },
  });
  return { records, events, commits, generated, get dbCalls() { return dbCalls; },
    async run(input = command(), ...flags) { const flag = flags.length ? flags[0] : 'true'; const old = process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
      if (flag === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = flag;
      try { return await service.createPrinterConnection(input); } finally { if (old === undefined) delete process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED; else process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = old; } } };
}

test('one create atomically activates fresh identity, empty queue, digest and both audits; secret only after commit', async()=>{
 const f=fixture({retry:()=>{}}), result=await f.run(), root=setupPath;
 assert.equal(result.username,'orderfly'); assert.equal(result.item.configuration.state,'active'); assert.equal(result.item.configuration.description,'Pizza');
 assert.equal(result.secret.length,43); assert.equal(Object.keys(result).includes('secret'),false); assert.equal(f.generated.length,1); assert.equal(f.commits.length,1);
 assert.equal(f.records.get(root+'/queue/state').pendingCount,0); assert.equal(f.records.get(root+'/statusMetadata/current').activationRevision,1);
 assert.ok(f.records.has(root+'/audit/1')); assert.ok(f.records.has(root+'/deviceCredentialAudit/1'));
 assert.equal(JSON.stringify([...f.records]).includes(result.secret),false);
 assert.equal(crypto.comparePrinterDeviceCredentialCandidates(f.records.get(root+'/deviceCredentials/current'),{brandId:'brand',locationId:'location',printerId:'prn_fixed',printerRevision:1,credentialRevision:1},result.secret).credentialMatches,true);
});
test('auth, suspended/deleted/foreign native scopes and concurrent revocation leave no partial enrollment',async()=>{
 const denied=fixture({denied:true}); await assert.rejects(denied.run(),/forbidden/); assert.equal(denied.dbCalls,0);
 for(const mutate of [r=>r.set('locations/location',{brandId:'foreign'}),r=>r.set('brands/brand',{status:'suspended'}),r=>r.set('brands/brand',{status:'active',deleted:true}),r=>r.set('locations/location',{brandId:'brand',isTestData:true}),r=>r.set('platformAdminControl/access-v1',companyPolicy())]){
  const f=fixture({retry:mutate}); await assert.rejects(f.run(),/forbidden/);assert.equal(f.commits.length,0);
 }
});
test('gate, schema and incompatible paper fail before persistence; orphan identity is never reused',async()=>{
 for(const flag of [undefined,'false','TRUE']){const f=fixture();await assert.rejects(f.run(command(),flag),/writes_unavailable/);assert.equal(f.dbCalls,0);}
 for(const input of [null,command({printerId:'chosen'}),command({model:'mc-print2',paperWidthMm:80}),command({description:'x'.repeat(161)}),command({name:' '})]){const f=fixture();await assert.rejects(f.run(input),/invalid_request/);assert.equal(f.commits.length,0);}
 for(const suffix of ['', '/jobs/old','/deviceCredentials/current','/deviceCredentialAudit/3','/pilotState/current','/connection/current','/pilotJobs/old','/pilotQualifications/old','/orderTestWindows/current']){
 const f=fixture({extra:[[setupPath+suffix,{orphan:true}]]});await assert.rejects(f.run(),/setup_conflict/);assert.equal(f.commits.length,0);}
});
test('audit failure rolls back everything; unknown commit returns no plaintext and cannot reuse identity',async()=>{
 const f=fixture({failAudit:true});const before=structuredClone([...f.records]);await assert.rejects(f.run(),/setup_unavailable/);assert.deepEqual([...f.records],before);
 const g=fixture({afterCommitError:true});await assert.rejects(g.run(),/setup_unavailable/);assert.equal(g.commits.length,1);await assert.rejects(g.run(),/setup_conflict/);assert.equal(g.commits.length,1);
});
