const {test}=require('node:test'); const assert=require('node:assert/strict'); const {loadTs}=require('../helpers/load-ts.cjs');
const {recordPrinterContact,projectPrinterConnection}=loadTs('src/lib/printing/connection-status.ts',{'server-only':{}});
const scope={brandId:'b',locationId:'l',printerId:'p'}, now=1000000;
const credential={schemaVersion:1,...scope,printerRevision:2,credentialRevision:3,secretDigest:'a'.repeat(64),issuedAt:1,revokedAt:null};
const contact={schemaVersion:1,...scope,printerRevision:2,credentialRevision:3,lastSeenAt:now-1000,endpoint:'test'};
test('only a recent current authenticated generation is connected; stale timestamps remain useful',()=>{
 assert.equal(projectPrinterConnection(contact,credential,scope,2,now).connected,true);
 for(const [c,k,r] of [[{...contact,lastSeenAt:now-90001},credential,2],[contact,{...credential,revokedAt:now},2],[contact,{...credential,credentialRevision:4},2],[contact,credential,3],[contact,{...credential,brandId:'other'},2]]){
  const projected=projectPrinterConnection(c,k,scope,r,now);assert.equal(projected.connected,false);assert.equal(projected.lastSeenAt,c.lastSeenAt);assert.doesNotMatch(JSON.stringify(projected),/Digest|credential/);
 }
 for(const c of [null,{...contact,brandId:'other'},{...contact,lastSeenAt:now+1},{...contact,extra:'private'}])assert.deepEqual(projectPrinterConnection(c,credential,scope,2,now),{connected:false,lastSeenAt:null,endpoint:null,checkedAt:now});
});
test('contact writes throttle same generation at 30 seconds, changed URL/revision records immediately',async()=>{
 const writes=[],reads=[];let saved=contact;
 const collection=p=>({doc:id=>({path:p+'/'+id,collection:n=>collection(p+'/'+id+'/'+n)})});
 const db={collection}, tx={get:async ref=>{reads.push(ref.path);return{data:()=>saved}},set:(ref,row)=>{writes.push([ref.path,row]);saved=row}};
 const identity={...scope,printerRevision:2,credentialRevision:3};
 await recordPrinterContact(tx,db,identity,'test',now);assert.equal(writes.length,0);
 await recordPrinterContact(tx,db,identity,'test',now+30000);assert.equal(writes.length,1);
 await recordPrinterContact(tx,db,identity,'live',now+30001);assert.equal(writes.length,2);
 await recordPrinterContact(tx,db,{...identity,credentialRevision:4},'live',now+30002);assert.equal(writes.length,3);
 assert.ok(reads.every(p=>p==='locations/l/printers/p/connection/current'));
 assert.deepEqual(Object.keys(saved).sort(),Object.keys(contact).sort());
});
