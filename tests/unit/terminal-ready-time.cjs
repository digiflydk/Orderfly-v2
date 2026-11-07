const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const { randomUUID } = require('node:crypto');
class AuthorityError extends Error { constructor(code, status = 403) { super(code); this.code = code; this.status = status; } }
const command = (extra = {}) => ({ orderId: 'order-a', brandId: 'brand-a', locationId: 'location-a', expectedReadyAt: null, readyAt:'2026-11-07T16:00:00.000Z', requestId: randomUUID(), ...extra });
function fixture(options = {}) {
  const rows = new Map([['orders/order-a', { brandId: 'brand-a', locationId: 'location-a', status: 'Received', deliveryType: 'Pickup', paymentStatus: 'Paid', paymentMethod: 'Stripe', ...options.order }]]);
  const writes = [], calls = [], mail = [];
  let denied = false, lock = Promise.resolve();
  const db = { collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }), runTransaction: run => {
    const operation = lock.then(async () => {
      const attempt = async commit => {
        const pending = []; let writing = false;
        const tx = { get: async ref => { assert.equal(writing, false, 'all reads must precede writes'); const value = rows.get(ref.path); return { exists: !!value, data: () => value && structuredClone(value) }; },
          update: (ref, value) => { writing = true; pending.push(['update', ref.path, value]); },
          create: (ref, value) => { writing = true; assert.equal(rows.has(ref.path), false); pending.push(['create', ref.path, value]); } };
        const result = await run(tx);
        if (commit && !options.failCommit) { for (const [kind, path, value] of pending) rows.set(path, kind === 'update' ? { ...rows.get(path), ...value } : value); writes.push(...pending); }
        else if (options.failCommit) throw Error('database private failure');
        return result;
      };
      if (options.retry) { await attempt(false); options.retry(rows); options.retry = null; }
      return attempt(true);
    });
    lock = operation.catch(() => {}); return operation;
  }};
  const mocks = {
    'server-only': {}, '@/lib/firebase-admin': { getAdminDb: () => db, getAdminFieldValue: () => ({ serverTimestamp: () => 'SERVER_TIME' }) },
    '@/lib/access/orderfly-session': { verifiedOrderflyIdentity: async () => { if (options.sessionError) throw options.sessionError; return { provider: 'firebase', subject: 'actor' }; } },
    '@/lib/access/authority': { AuthorityError, principalKey: () => 'actor-key' },
    '@/lib/access/scoped-data': { authorizeTransaction: async (tx, identity, order, permission, kind) => { calls.push({ identity, order, permission, kind }); if (denied || options.deny) throw new AuthorityError('forbidden'); } },
    '@/lib/feedback/mail-queue': { queueOrderFeedback: async (...args) => { mail.push(args); if (options.mailFail) throw Error('optional mail'); } },
  };
  const service = loadTs('src/lib/orders/terminal-ready-time.ts', mocks);
  return { ...service, rows, writes, calls, mail, revoke: () => { denied = true; }, mocks };
}
const now=new Date('2026-11-07T15:00:00.000Z');
test('kitchen time is saved and audited without changing customer commitment, payment or courier',async()=>{
 const f=fixture({order:{fulfillmentAt:'2026-11-07T15:30:00Z',managedDelivery:{provider:'fixture'}}}),cmd=command();
 const result=await f.updateTerminalReadyTime(cmd,'admin',now);assert.equal(result.changed,true);
 const saved=f.rows.get('orders/order-a');assert.equal(saved.kitchenReadyAt.toISOString(),cmd.readyAt);assert.equal(saved.fulfillmentAt,'2026-11-07T15:30:00Z');assert.equal(saved.paymentStatus,'Paid');assert.deepEqual(saved.managedDelivery,{provider:'fixture'});
 assert.deepEqual(f.writes[0].slice(0,2),['update','orders/order-a']);assert.deepEqual(Object.keys(f.writes[0][2]),['kitchenReadyAt','updatedAt']);assert.equal(f.writes[1][2].action,'terminal_ready_time_changed');assert.equal(f.calls[0].permission,'orderfly.orders:edit');
 const retry=await f.updateTerminalReadyTime(cmd,'admin',now);assert.equal(retry.changed,false);assert.equal(f.writes.length,2);
});
test('revoked, foreign, read-only, terminal and stale-time commands cannot change time',async()=>{
 for(const options of [{deny:true},{order:{brandId:'foreign'}},{order:{status:'Ready'}},{order:{status:'Completed'}},{order:{kitchenReadyAt:'2026-11-07T15:45:00Z'}}]){
  const f=fixture(options);await assert.rejects(f.updateTerminalReadyTime(command(),'admin',now));assert.equal(f.writes.length,0);
 }
 const f=fixture(),cmd=command();await f.updateTerminalReadyTime(cmd,'admin',now);f.revoke();await assert.rejects(f.updateTerminalReadyTime(cmd,'admin',now));
});
test('invalid dates, excessive delay, unknown fields and request reuse fail closed',async()=>{
 for(const patch of [{readyAt:'not a date'},{readyAt:'2026-11-07T14:00:00.000Z'},{readyAt:'2026-11-09T16:00:00.000Z'},{canEdit:true}]){const f=fixture();await assert.rejects(f.updateTerminalReadyTime(command(patch),'admin',now));assert.equal(f.writes.length,0);}
 const f=fixture(),cmd=command();await f.updateTerminalReadyTime(cmd,'admin',now);await assert.rejects(f.updateTerminalReadyTime({...cmd,readyAt:'2026-11-07T17:00:00.000Z'},'admin',now));
});
test('terminal session uses terminal scope and cannot obtain employee authority',async()=>{
 const f=fixture();let checks=0;
 f.mocks['@/lib/terminal-auth/access']={getOrderTerminalActor:async source=>{assert.equal(source,'terminal');return {actorId:'terminal-actor'};},authorizeOrderTerminalTransaction:async(tx,actor,scope)=>{checks++;assert.equal(scope.brandId,'brand-a');}};
 f.mocks['@/lib/access/orderfly-session'].verifiedOrderflyIdentity=async()=>{throw Error('must not use employee identity');};
 const service=loadTs('src/lib/orders/terminal-ready-time.ts',f.mocks);await service.updateTerminalReadyTime(command(),'terminal',now);assert.equal(checks,1);
});
test('time routes reject cross-origin and oversized bodies before writes',async()=>{
 for(const kind of ['merchant','terminal']){
  let writes=0;const {POST}=loadTs(`src/app/api/${kind}/orders/ready-time/route.ts`,{'@/lib/access/authority':{AuthorityError},'@/lib/url':{getOrigin:async()=>'https://esmeralda.orderfly.dk'},'@/lib/orders/terminal-ready-time':{TerminalReadyTimeError:class extends Error{},updateTerminalReadyTime:async()=>{writes++;return {success:true};}}});
  const request=(origin,body)=>new Request('https://esmeralda.orderfly.dk/api/'+kind+'/orders/ready-time',{method:'POST',headers:{origin,'content-type':'application/json'},body});
  assert.equal((await POST(request('https://other.example','{}'))).status,403);assert.equal((await POST(request('https://esmeralda.orderfly.dk','x'.repeat(5000)))).status,400);assert.equal(writes,0);
 }
});
