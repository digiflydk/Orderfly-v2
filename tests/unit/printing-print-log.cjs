const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const domain=loadTs('src/lib/printing/print-log.ts');
const authority=loadTs('src/lib/access/authority.ts',{'server-only':{}});
const scope={brandId:'b',locationId:'l',printerId:'p',locationName:'Amager',printerName:'Kitchen'};
const base={brandId:'b',locationId:'l',printerId:'p',orderId:'ORD-1',kind:'kitchen',createdAt:1000};
const manual={...base,jobId:'m',state:'queued',expiresAt:601000,offeredAt:null,downloadedAt:null,completedAt:null,payloadBase64:'SECRET',tokenDigest:'SECRET',actorId:'SECRET'};
test('safe metadata projection distinguishes queued, transfer, confirmed, expired and unknown',()=>{
 const cases=[['queued',{},2000,'queued'],['offered',{offeredAt:2000},3000,'offered'],['download_started',{offeredAt:2000,downloadedAt:3000},4000,'download_started'],['confirmed',{offeredAt:2000,downloadedAt:3000,completedAt:4000},900000,'confirmed'],['failed',{offeredAt:2000,downloadedAt:3000,completedAt:4000},900000,'failed'],['queued',{},900000,'expired'],['offered',{offeredAt:2000},900000,'expired'],['download_started',{offeredAt:2000,downloadedAt:3000},900000,'unknown']];
 for(const [state,extra,now,expected] of cases){const row=domain.projectPrintLog('manualPrintRequests','m',{...manual,state,...extra},scope,now);assert.equal(row.status,expected);assert.equal(JSON.stringify(row).includes('SECRET'),false);assert.equal(row.source,'manual');}
 assert.throws(()=>domain.projectPrintLog('manualPrintRequests','m',{...manual,state:'confirmed'},scope,3000));
});
test('rejects nested or outer foreign scope and mismatched job identities',()=>{
 for(const raw of [{...manual,brandId:'foreign'},{...manual,locationId:'foreign'},{...manual,printerId:'foreign'},{...manual,jobId:'other'}])assert.throws(()=>domain.projectPrintLog('manualPrintRequests','m',raw,scope,2000));
 const ordinary={...base,jobId:'a',job:base,state:'offered',offeredAt:2000,expiresAt:62000,downloadedAt:null,completedAt:null};
 assert.equal(domain.projectPrintLog('ordinaryDispatches','a',ordinary,scope,3000).status,'offered');
 assert.throws(()=>domain.projectPrintLog('ordinaryDispatches','a',{...ordinary,job:{...base,brandId:'foreign'}},scope,3000));
});
function fixture(){
 const path='locations/l/printers/p',records=new Map([['locations/l',{brandId:'b',name:'Amager'}],[path,{configuration:{brandId:'b',locationId:'l',name:'Kitchen'}}]]),queries=[];let denied=false;
 const value=(r,k)=>k.split('.').reduce((a,b)=>a?.[b],r);
 const doc=p=>({path:p,id:p.split('/').at(-1),collection:n=>query(p+'/'+n),get parent(){return query(p.slice(0,p.lastIndexOf('/')));}});
 const snapshot=p=>({id:p.split('/').at(-1),ref:doc(p),exists:records.has(p),data:()=>structuredClone(records.get(p))});
 function query(p,filters=[],orders=[],after=null,fields=null,limit=Infinity){return {path:p,get parent(){return doc(p.slice(0,p.lastIndexOf('/')));},doc:id=>doc(p+'/'+id),where:(...f)=>query(p,[...filters,f],orders,after,fields,limit),orderBy:(...o)=>query(p,filters,[...orders,o],after,fields,limit),startAfter:(...a)=>query(p,filters,orders,a,fields,limit),select:(...f)=>query(p,filters,orders,after,f,limit),limit:n=>query(p,filters,orders,after,fields,n),async get(){
 queries.push({p,filters,orders,after,fields,limit});
 let rows=[...records].filter(([key])=>key.startsWith(p+'/')&&!key.slice(p.length+1).includes('/'));
 for(const [key,op,val]of filters)rows=rows.filter(([,row])=>op==='=='?value(row,key)===val:op==='<'?value(row,key)<val:value(row,key)<=val);
 const cmp=(a,b)=>{for(const [key,dir]of orders){const av=key==='__name__'?a[0].split('/').at(-1):value(a[1],key),bv=key==='__name__'?b[0].split('/').at(-1):value(b[1],key);if(av!==bv)return(av<bv?-1:1)*(dir==='desc'?-1:1);}return 0;};rows.sort(cmp);
 if(after){rows=rows.filter(([key,row])=>value(row,orders[0][0])<after[0]||(value(row,orders[0][0])===after[0]&&key.split('/').at(-1)<after[1]));}
 const docs=rows.slice(0,limit).map(([key])=>snapshot(key));return{docs,size:docs.length};
 }};}
 const db={collection:query,async getAll(...refs){assert.ok(refs.at(-1).fieldMask);return refs.slice(0,-1).map(ref=>snapshot(ref.path));}};
 const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},'@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{if(denied)throw new authority.AuthorityError('forbidden');}},'@/lib/access/authority':authority,'./print-log':domain};
 const read=loadTs('src/lib/printing/print-log-read.ts',mocks);const http=loadTs('src/lib/printing/print-log-http.ts',{...mocks,'./print-log-read':read});
 return{records,path,queries,read,http,deny(){denied=true;}};
}
test('merged pagination is deterministic across equal timestamps, sources and printers; no duplicates',async()=>{
 const f=fixture();f.records.set('locations/l/printers/p2',{configuration:{brandId:'b',locationId:'l',name:'Second'}});
 for(const printerId of ['p','p2'])for(const id of ['a','b','c'])f.records.set(`locations/l/printers/${printerId}/manualPrintRequests/${id}`,{...manual,printerId,jobId:id});
 f.records.set(f.path+'/jobs/q',{...base,id:'q',state:'queued'});
 f.records.set(f.path+'/ordinaryDispatches/q',{...base,jobId:'q',job:base,state:'offered',offeredAt:1000,expiresAt:61000,downloadedAt:null,completedAt:null});
 let cursor,items=[],pages=0;do{const result=await f.read.readPrintLog({brandId:'b',limit:2,cursor});items.push(...result.items);cursor=result.nextCursor;pages++;assert.ok(pages<10);}while(cursor);
 assert.equal(items.length,7);assert.equal(new Set(items.map(x=>x.id)).size,7);assert.equal(items.some(x=>x.id.includes('/jobs/')),false);
 assert.ok(f.queries.every(q=>Number.isFinite(q.limit)));assert.ok(f.queries.every(q=>q.fields&&!q.fields.includes('payloadBase64')));
});
test('HTTP rejects unauthorized access before database reads and validates duplicate/unknown params',async()=>{
 const f=fixture();f.deny();assert.equal((await f.http.handlePrintLog(new Request('https://test/?brandId=b'))).status,403);assert.equal(f.queries.length,0);
 for(const url of ['?brandId=b&brandId=x','?brandId=b&limit=51','?brandId=b&limit=0','?brandId=b&payload=true','?brandId=b&cursor=','?brandId=../x']){const g=fixture();const res=await g.http.handlePrintLog(new Request('https://test/'+url));assert.equal(res.status,400,url);assert.equal(g.queries.length,0);}
 const g=fixture(),res=await g.http.handlePrintLog(new Request('https://test/?brandId=b'));assert.equal(res.status,200);assert.equal(res.headers.get('cache-control'),'no-store');
});
test('cursor cannot cross brands or inject paths, and topology overflow is explicit',async()=>{
 assert.throws(()=>domain.decodePrintLogCursor(domain.encodePrintLogCursor({v:1,brandId:'foreign',at:1,path:'locations/l/printers/p/jobs/a'}),'b'));
 assert.throws(()=>domain.decodePrintLogCursor(Buffer.from(JSON.stringify({v:1,brandId:'b',at:1,path:'secrets/x'})).toString('base64url'),'b'));
 const f=fixture();await assert.rejects(f.read.readPrintLog({brandId:'b',cursor:domain.encodePrintLogCursor({v:1,brandId:'b',at:1,path:'locations/foreign/printers/p/jobs/a'})}),e=>e.code==='print_log_invalid');
 for(let i=0;i<51;i++)f.records.set(`locations/l/printers/p${i}`,{configuration:{brandId:'b',locationId:'l',name:'P'}});
 await assert.rejects(f.read.readPrintLog({brandId:'b'}),e=>e.code==='print_log_scope_too_large');
});
test('malformed timestamp or terminal lifecycle fails closed instead of inventing print evidence',async()=>{
 const f=fixture();f.records.set(f.path+'/manualPrintRequests/m',{...manual,createdAt:'not-a-time'});
 await assert.rejects(f.read.readPrintLog({brandId:'b'}),e=>e.code==='print_log_unavailable');
 for(const state of ['confirmed','failed','unknown'])assert.throws(()=>domain.projectPrintLog('manualPrintRequests','m',{...manual,state},scope,2000));
 assert.throws(()=>domain.projectPrintLog('manualPrintRequests','m',{...manual,state:'download_started',offeredAt:2000,downloadedAt:1000},scope,3000));
});
test('authentication service outages stay unavailable and never read print records',async()=>{
 const mocks={'server-only':{},'@/lib/access/authority':authority,'./print-log':domain,'./print-log-read':{readPrintLog:async()=>assert.fail('must not read')},'@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{throw new authority.AuthorityError('authority_unavailable',503);}}};
 const http=loadTs('src/lib/printing/print-log-http.ts',mocks);const res=await http.handlePrintLog(new Request('https://test/?brandId=b'));
 assert.equal(res.status,503);assert.deepEqual(await res.json(),{error:'print_log_unavailable'});
});
