const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture(){
 const calls=[],rows=new Map([['orders/a',{id:'forged',brandId:'b'}]]);
 const snap=path=>({id:path.split('/').at(-1),ref:{path},exists:rows.has(path),data:()=>rows.get(path)});
 const write=(kind,ref,data,options)=>{calls.push([kind,ref.path,data,options]);if(kind==='delete')rows.delete(ref.path);else rows.set(ref.path,options?.merge?{...rows.get(ref.path),...data}:data);};
 const doc=path=>({id:path.split('/').at(-1),path,get:async()=>snap(path),set:(data,options)=>write('set',{path},data,options),update:data=>write('update',{path},data,{merge:true}),delete:()=>write('delete',{path})});
 const collection=path=>{const q={path,doc:(id='generated')=>doc(path+'/'+id),where:(...args)=>{calls.push(['where',...args]);return q;},orderBy:(...args)=>{calls.push(['orderBy',...args]);return q;},limit:n=>{calls.push(['limit',n]);return q;},startAfter:v=>{assert.equal(v.ref.path,'orders/a');calls.push(['cursor',v]);return q;},get:async()=>({docs:[snap('orders/a')],empty:false,size:1})};return q;};
 const tx={get:async ref=>snap(ref.path),set:(...args)=>write('set',...args),update:(ref,data)=>write('update',ref,data,{merge:true}),delete:ref=>write('delete',ref)};
 const db={doc,collection,runTransaction:run=>run(tx),batch:()=>({...tx,commit:async()=>calls.push(['commit'])})};
 return {api:loadTs('src/lib/server/firestore-compat.ts',{'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db}}),calls,rows};
}
test('server adapter preserves scoped query constraints and native snapshot cursors',async()=>{
 const {api,calls}=fixture();const ref=api.doc(api.db,'orders','a'),saved=await api.getDoc(ref);
 assert.equal(ref.id,'a');assert.equal(saved.exists(),true);assert.equal(saved.id,'a');
 const result=await api.getDocs(api.query(api.collection(api.db,'orders'),api.where('brandId','==','b'),api.orderBy('createdAt','desc'),api.startAfter(saved),api.limit(10)));
 assert.equal(result.docs[0].id,'a');assert.equal(result.size,1);assert.equal(result.empty,false);
 assert.ok(calls.some(c=>c[0]==='where'&&c[1]==='brandId'&&c[3]==='b'));
});
test('transaction adapter preserves checkout reads, merge semantics and committed result',async()=>{
 const {api,rows}=fixture(),ref=api.doc(api.db,'orders','a');
 const result=await api.runTransaction(api.db,async tx=>{const saved=await tx.get(ref);assert.equal(saved.exists(),true);tx.set(ref,{state:'pending'},{merge:true});return saved.id;});
 assert.equal(result,'a');assert.equal(rows.get('orders/a').brandId,'b');assert.equal(rows.get('orders/a').state,'pending');
 const next=api.doc(api.collection(api.db,'orders'));assert.equal(next.id,'generated');
 const batch=api.writeBatch(api.db);batch.set(next,{brandId:'b'});batch.delete(ref);await batch.commit();
 assert.equal(rows.has('orders/a'),false);assert.equal(rows.get('orders/generated').brandId,'b');
});
