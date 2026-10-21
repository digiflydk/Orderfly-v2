const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const {createQrAnalyticsService,parseQrAnalyticsDates,exportQrAnalyticsCsv,QR_ANALYTICS_EVENT_LIMIT}=loadTs('src/lib/qr/analytics.ts');
const {classifyQrRequest}=loadTs('src/lib/qr/metrics.ts');
const DAY=86400000,NOW=Date.parse('2026-10-21T12:00:00Z');
const scope={brandId:'own',locationIds:['l1'],actorId:'reader'};
const classification=()=>classifyQrRequest({method:'GET',userAgent:'Mozilla/5.0 (iPhone) Version/17.0 Mobile Safari/604.1'});
const row=(extra={})=>({brandId:'own',locationId:'l1',qrId:'code',timestamp:NOW-1000,classification:classification(),...extra});
function fixture(rows=[],overrides={}) {
 const trace=[],filters=[],orders=[];
 const code={id:'code',brandId:'own',locationId:'l1',name:'QR test',campaign:'Flyer',tags:['front'],...overrides.code};
 let cap;
 const query=path=>({
  collection:name=>query(path+'/'+name),doc:id=>query(path+'/'+id),
  where(field,op,value){filters.push([field,op,value]);return this;},orderBy(field,direction){orders.push([field,direction]);return this;},limit(value){cap=value;return this;},
  async get(){trace.push(['events',path]);if(overrides.error)throw Error('database_unavailable');
   let list=rows.map((data,i)=>({id:String(i).padStart(6,'0'),data:()=>data}));
   if(!overrides.forceRows)list=list.filter(d=>filters.every(([field,op,value])=>op==='=='?d.data()[field]===value:op==='>='?d.data()[field]>=value:d.data()[field]<value));
   list.sort((a,b)=>a.data().timestamp-b.data().timestamp||a.id.localeCompare(b.id));return {docs:list.slice(0,cap)};
  },
 });
 const db={collection:name=>query(name)};
 const service=createQrAnalyticsService(db,{now:()=>NOW,getCode:async(s,id)=>{trace.push(['code',s.brandId,id]);if(overrides.denied)throw Error('forbidden');return code;}});
 return {service,trace,filters,orders,limit:()=>cap};
}
const range={from:NOW-DAY,to:NOW};
test('Danish inclusive dates validate the real calendar and preserve DST midnight boundaries',()=>{
 const spring=parseQrAnalyticsDates({from:'2026-03-29',to:'2026-03-29'}),autumn=parseQrAnalyticsDates({from:'2026-10-25',to:'2026-10-25'});
 assert.equal(spring.to-spring.from,23*3600000);assert.equal(autumn.to-autumn.from,25*3600000);
 assert.equal(new Date(spring.from).toISOString(),'2026-03-28T23:00:00.000Z');
 assert.equal(parseQrAnalyticsDates({from:'2024-02-29',to:'2024-02-29'}).to-parseQrAnalyticsDates({from:'2024-02-29',to:'2024-02-29'}).from,DAY);
 for(const input of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-02-29',to:'2026-03-01'},{from:'2026-1-01',to:'2026-01-02'},{from:'2026-10-21',to:'2026-10-20'},{from:'2025-01-01',to:'2026-01-02'},{from:'9999-12-31',to:'9999-12-31'}])assert.throws(()=>parseQrAnalyticsDates(input));
 assert.doesNotThrow(()=>parseQrAnalyticsDates({from:'2024-01-01',to:'2024-12-31'}));
});
test('code lookup precedes a scoped, bounded, stable events query',async()=>{
 const f=fixture([row()]),result=await f.service.read(scope,'code',range);
 assert.deepEqual(f.trace,[['code','own','code'],['events','brands/own/qrCodes/code/qrScanEvents']]);
 assert.deepEqual(f.filters,[['brandId','==','own'],['qrId','==','code'],['locationId','==','l1'],['timestamp','>=',range.from],['timestamp','<',range.to]]);
 assert.deepEqual(f.orders,[['timestamp','asc'],['__name__','asc']]);assert.equal(f.limit(),10001);
 assert.equal(result.complete,true);assert.equal(result.totalsAreExact,true);assert.equal(result.currentLocationOnly,true);
 assert.equal(result.metrics.probableScans,1);assert.equal(result.metrics.estimatedUnique,null);assert.equal(result.metrics.knownUnique,0);
});
test('missing authorization, foreign stored brand and location prevent all events I/O',async()=>{
 for(const options of [{denied:true},{code:{brandId:'foreign'}},{code:{locationId:'foreign'}},{code:{locationId:null}},{code:{id:'other'}}]){
  const f=fixture([],options);await assert.rejects(f.service.read(scope,'code',range));assert.equal(f.trace.filter(([kind])=>kind==='events').length,0);
 }
 for(const bad of [{...scope,brandId:'../foreign'},{...scope,actorId:''},{...scope,locationIds:[]},{...scope,locationIds:['../foreign']}]){
  const f=fixture();await assert.rejects(f.service.read(bad,'code',range));assert.equal(f.trace.length,0);
 }
});
test('brand-wide analytics still uses explicit current location equality and rejects unsafe IDs',async()=>{
 const f=fixture([row({locationId:null})],{code:{locationId:null}}),result=await f.service.read({...scope,locationIds:null},'code',range);
 assert.equal(result.metrics.totalOpenings,1);assert.ok(f.filters.some(v=>v[0]==='locationId'&&v[2]===null));
 const other=fixture();await assert.rejects(other.service.read(scope,'../code',range));assert.equal(other.trace.length,0);
});
test('interval is half-open and analytics never reads beyond its requested range',async()=>{
 const f=fixture([row({timestamp:range.from-1}),row({timestamp:range.from}),row({timestamp:range.to-1}),row({timestamp:range.to})]);
 const result=await f.service.read(scope,'code',range);assert.equal(result.metrics.totalOpenings,2);assert.equal(result.complete,true);
 for(const bad of [{from:NOW,to:NOW},{from:NaN,to:NOW},{from:NOW-367*DAY,to:NOW},{from:NOW+0.1,to:NOW+1}]){
  const invalid=fixture();await assert.rejects(invalid.service.read(scope,'code',bad));assert.equal(invalid.trace.length,0);
 }
});
test('truncation returns explicitly incomplete sampled metrics without fabricated exact totals',async()=>{
 const f=fixture(Array.from({length:QR_ANALYTICS_EVENT_LIMIT+1},()=>row())),result=await f.service.read(scope,'code',range);
 assert.equal(result.truncated,true);assert.equal(result.complete,false);assert.equal(result.totalsAreExact,false);assert.equal(result.sampledEvents,10000);
 assert.equal(result.metrics.totalOpenings,10000);assert.equal(result.metrics.estimatedUnique,null);
});
test('TTL retention and future intervals are visibly incomplete even when the query is empty',async()=>{
 const f=fixture(),old=await f.service.read(scope,'code',{from:NOW-91*DAY,to:NOW});
 assert.equal(old.retentionLimited,true);assert.equal(old.complete,false);
 const future=await fixture().service.read(scope,'code',{from:NOW-DAY,to:NOW+1});assert.equal(future.futureLimited,true);assert.equal(future.complete,false);
 const empty=await fixture().service.read(scope,'code',range);assert.equal(empty.complete,true);assert.equal(empty.metrics.totalOpenings,0);
});
test('foreign, malformed and contradictory persisted rows cannot leak and mark data incomplete',async()=>{
 const f=fixture([row({brandId:'foreign'}),row({locationId:'foreign'}),row({qrId:'foreign'}),row({classification:{...classification(),probableScan:true,opening:false}}),row({classification:{...classification(),browser:'injected-browser'}}),row()],{forceRows:true});
 const result=await f.service.read(scope,'code',range);assert.equal(result.discardedEvents,5);assert.equal(result.complete,false);assert.equal(result.metrics.totalOpenings,1);
 assert.equal(JSON.stringify(result).includes('injected-browser'),false);
});
test('only aggregate safe fields are projected and CSV neutralizes code-name formulas',async()=>{
 const f=fixture([row({visitorKey:'not-an-approved-identifier',ip:'secret-ip',userAgent:'secret-agent',classification:{...classification(),referrerOrigin:'https://example.com/path?email=secret'}})],{code:{name:'=HYPERLINK("evil")'}});
 const result=await f.service.read(scope,'code',range),json=JSON.stringify(result),csv=exportQrAnalyticsCsv(result);
 for(const secret of ['secret-ip','secret-agent','not-an-approved-identifier','email=secret'])assert.equal(json.includes(secret),false);
 assert.equal(result.metrics.estimatedUnique,null);assert.deepEqual(result.metrics.byReferrer,[{key:'https://example.com',count:1}]);
 assert.ok(csv.includes('"\'=HYPERLINK(""evil"")"'));assert.ok(csv.includes('"complete"'));assert.ok(csv.includes('"Europe/Copenhagen"'));
});
test('known bots are counted as openings but not probable scans and database errors remain failures',async()=>{
 const result=await fixture([row({classification:classifyQrRequest({method:'GET',userAgent:'Googlebot/2.1'})}),row()]).service.read(scope,'code',range);
 assert.equal(result.metrics.totalOpenings,2);assert.equal(result.metrics.probableScans,1);assert.equal(result.metrics.excludedOpenings,1);
 await assert.rejects(fixture([],{error:true}).service.read(scope,'code',range),/database_unavailable/);
});
