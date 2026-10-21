const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp, FieldPath } = require('firebase-admin/firestore');
const { loadTs } = require('../helpers/load-ts.cjs');
const { runQrRetention, QR_RETENTION_GROUPS } = loadTs('src/lib/qr/retention.ts');
const now = Date.parse('2026-10-21T12:00:00Z');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const eventPath = n => `brands/brand-a/qrCodes/poster/qrScanEvents/${uuid(n)}`;
const ratePath = n => `brands/brand-a/qrCodes/poster/qrRateLimits/${n}`;
const row = (expiresAt = new Date(now-1), extra={}) => ({brandId:'brand-a',qrId:'poster',expiresAt,...extra});

function fixture(initial = []) {
  const rows = new Map(initial); const queries=[],deleted=[],transactions=[];
  const config = { beforeTransaction: null, transactionError: null, queryError: null };
  const ref = path => ({path});
  const snapshot = (path,data) => ({exists:data!==undefined,id:path.split('/').at(-1),ref:ref(path),data:()=>data});
  const db = {
    doc: ref,
    collectionGroup(group) {
      let after=null,limit=Infinity;
      const query={
        orderBy(field) {assert.equal(field.isEqual(FieldPath.documentId()),true);return query;},
        startAfter(value) {after=value.path;return query;},
        limit(value) {limit=value;return query;},
        async get() {queries.push({group,after,limit});if(config.queryError===group)throw Error('private-query-error');
          return {docs:[...rows].filter(([path])=>path.split('/').at(-2)===group && (!after||path>after)).sort(([a],[b])=>a<b?-1:a>b?1:0).slice(0,limit).map(([path,data])=>snapshot(path,{...data}))};},
      }; return query;
    },
    async runTransaction(fn) {
      if(config.beforeTransaction)await config.beforeTransaction(rows);
      const pending=[];
      const tx={async get(reference){transactions.push(reference.path);if(config.transactionError===reference.path)throw Error('private-tx-error');return snapshot(reference.path,rows.get(reference.path));},delete(reference){pending.push(reference.path);}};
      const result=await fn(tx);for(const path of pending){rows.delete(path);deleted.push(path);}return result;
    },
  };
  return {db,rows,queries,deleted,transactions,config};
}

test('only canonical expired Date/Timestamp events and scoped rate limiters are deleted',async()=>{
  const f=fixture([[eventPath(1),row()], [eventPath(2),row(Timestamp.fromMillis(now))], [eventPath(3),row(new Date(now+1))],
    [ratePath(12345),row()], [ratePath(12346),row(new Date(now+100))]]);
  const result=await runQrRetention(f.db,{now});
  assert.equal(result.scanned,5);assert.equal(result.deleted,3);assert.equal(result.deletedEvents,2);assert.equal(result.deletedRateLimits,1);assert.equal(result.skipped,2);assert.equal(result.errors,0);
  assert.deepEqual(new Set(f.deleted),new Set([eventPath(1),eventPath(2),ratePath(12345)]));assert.deepEqual(result.nextCursor,{events:null,rateLimits:null});
  assert.deepEqual(f.queries.map(q=>q.group),[QR_RETENTION_GROUPS.events,QR_RETENTION_GROUPS.rateLimits]);
});

test('wrong brands, QR IDs, foreign paths, invalid event IDs and malformed expiry are never deleted',async()=>{
  const paths=[
    [eventPath(1),row(new Date(now-1),{brandId:'other'})], [eventPath(2),row(new Date(now-1),{qrId:'other'})],
    [eventPath(3),row(now-1)], [eventPath(4),row('2020-01-01')], [eventPath(5),row(new Date(NaN))],
    [eventPath(6),row({toMillis:()=>0})], [eventPath(7),row(null)],
    ['archive/foreign/qrScanEvents/'+uuid(8),row()], ['brands/brand-a/qrCodes/poster/qrScanEvents/not-a-uuid',row()],
    ['brands/brand-a/qrCodes/poster/qrRateLimits/not-a-minute',row()],
    ['brands/brand-a/qrCodes/poster/events/'+uuid(9),row()],
  ];
  const f=fixture(paths);const result=await runQrRetention(f.db,{now});assert.equal(result.deleted,0);assert.equal(result.scanned,10);assert.equal(result.skipped,10);assert.equal(f.transactions.length,0);assert.equal(f.rows.size,11);
});

test('transaction re-read preserves a concurrently refreshed, rescoped or removed document',async()=>{
  for(const mode of ['refresh','scope','missing']){
    const f=fixture([[eventPath(1),row()]]);f.config.beforeTransaction=rows=>{
      if(mode==='missing')rows.delete(eventPath(1));else rows.set(eventPath(1),row(mode==='refresh'?new Date(now+1):new Date(now-1),mode==='scope'?{brandId:'other'}:{}));
    };
    const result=await runQrRetention(f.db,{now});assert.equal(result.deleted,0);assert.equal(result.skipped,1);assert.equal(result.errors,0);assert.equal(f.deleted.length,0);
  }
});

test('pagination advances past malformed foreign rows so valid QR events cannot be starved',async()=>{
  const entries=Array.from({length:3},(_,i)=>['archive/foreign/qrScanEvents/'+uuid(i),row()]);entries.push([eventPath(9),row()]);
  const f=fixture(entries);
  const first=await runQrRetention(f.db,{now,limit:4});assert.equal(first.scanned,2);assert.equal(first.deleted,0);assert.ok(first.nextCursor.events.startsWith('archive/'));
  const second=await runQrRetention(f.db,{now,limit:4,cursor:first.nextCursor});assert.equal(second.scanned,2);assert.equal(second.deleted,1);assert.equal(f.rows.has(eventPath(9)),false);
  const third=await runQrRetention(f.db,{now,limit:4,cursor:second.nextCursor});assert.deepEqual(third.nextCursor,{events:null,rateLimits:null});
});

test('one invocation never scans or deletes more than 100; both families receive a bounded budget',async()=>{
  const f=fixture([...Array.from({length:70},(_,i)=>[eventPath(i),row()]),...Array.from({length:70},(_,i)=>[ratePath(1000+i),row()])]);
  const first=await runQrRetention(f.db,{now});assert.equal(first.scanned,100);assert.equal(first.deleted,100);assert.equal(first.deletedEvents,50);assert.equal(first.deletedRateLimits,50);assert.equal(f.transactions.length,100);
  assert.deepEqual(f.queries.map(q=>q.limit),[50,50]);
  const second=await runQrRetention(f.db,{now,cursor:first.nextCursor});assert.equal(second.deleted,40);assert.deepEqual(second.nextCursor,{events:null,rateLimits:null});assert.equal(f.rows.size,0);
});

test('future rows still advance the cursor and each family gets capacity at the minimum limit',async()=>{
  const f=fixture([[eventPath(1),row(new Date(now+1))],[eventPath(2),row()],[ratePath(1234),row()]]);
  const first=await runQrRetention(f.db,{now,limit:2});assert.equal(first.scanned,2);assert.equal(first.deletedRateLimits,1);assert.equal(first.deletedEvents,0);
  const second=await runQrRetention(f.db,{now,limit:2,cursor:first.nextCursor});assert.equal(second.deletedEvents,1);
});

test('query failures retain the failed family cursor while the other family progresses',async()=>{
  const cursor={events:eventPath(1),rateLimits:null};const f=fixture([[eventPath(2),row()],[ratePath(2),row()]]);f.config.queryError='qrScanEvents';
  const result=await runQrRetention(f.db,{now,cursor});assert.equal(result.errors,1);assert.equal(result.nextCursor.events,cursor.events);assert.equal(result.deletedRateLimits,1);assert.equal(result.deletedEvents,0);assert.equal(JSON.stringify(result).includes('private-query-error'),false);
});

test('transaction errors are counted and do not block later expired candidates',async()=>{
  const f=fixture([[eventPath(1),row()],[eventPath(2),row()]]);f.config.transactionError=eventPath(1);
  const result=await runQrRetention(f.db,{now});assert.equal(result.errors,1);assert.equal(result.deletedEvents,1);assert.equal(f.rows.has(eventPath(1)),true);assert.equal(f.rows.has(eventPath(2)),false);assert.equal(JSON.stringify(result).includes('private-tx-error'),false);
});

test('invalid options fail before any query and cursors cannot change collection groups',async()=>{
  for(const options of [{now:NaN},{now:Infinity},{limit:1},{limit:101},{limit:2.5},{cursor:[]},{cursor:{events:'brands/a/qrCodes/b/events/c'}},{cursor:{rateLimits:eventPath(1)}},{cursor:{events:'brands//qrScanEvents/a'}}]){
    const f=fixture();await assert.rejects(()=>runQrRetention(f.db,{now,...options}));assert.equal(f.queries.length,0);
  }
});
