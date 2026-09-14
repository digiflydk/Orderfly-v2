const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture(){
 const rows=new Map([
  ['brands/a',{status:'active'}],['brands/b',{status:'active'}],
  ['locations/l',{brandId:'a',isActive:true}],['locations/foreign',{brandId:'b',isActive:true}],
  ['products/one',{brandId:'a',locationIds:['l'],isActive:true,price:20,productName:'One',privateCost:3}],
  ['products/shared',{brandId:'a',locationIds:[],isActive:true,price:30,productName:'Shared'}],
  ['products/foreign',{brandId:'b',locationIds:[],isActive:true,price:40}],
  ['products/draft',{brandId:'a',locationIds:['l'],isActive:false}],
  ['products/test',{brandId:'a',locationIds:['l'],isActive:true,isTestData:true}],
  ['products/elsewhere',{brandId:'a',locationIds:['another'],isActive:true}],
 ]),queries=[];
 const snap=path=>({id:path.split('/')[1],exists:rows.has(path),data:()=>rows.get(path)});
 const query=(name,filters=[])=>({
  doc:id=>({get:async()=>snap(name+'/'+id)}),
  where:(field,op,value)=>query(name,[...filters,[field,op,value]]),
  get:async()=>{
   queries.push({name,filters});
   const docs=[...rows].filter(([key,data])=>key.startsWith(name+'/')&&filters.every(([field,op,value])=>{
    const actual=field==='__name__'?key.split('/')[1]:data[field];return op==='=='?actual===value:value.includes(actual);
   })).map(([key])=>snap(key));
   return {docs};
  },
 });
 const api=loadTs('src/lib/server/menu-products.ts',{'server-only':{},'firebase-admin/firestore':{FieldPath:{documentId:()=> '__name__'}},'@/lib/firebase-admin':{getAdminDb:()=>({collection:name=>query(name)})}});
 return {api,rows,queries};
}
test('public menu queries the native brand and returns only active public fields at the selected location',async()=>{
 const f=fixture(),products=await f.api.publicMenuProducts('l');
 assert.deepEqual(products.map(p=>p.id).sort(),['one','shared']);
 assert.equal(Object.hasOwn(products[0],'privateCost'),false);
 assert.ok(f.queries.every(q=>q.filters.some(([key,op,value])=>key==='brandId'&&op==='=='&&value==='a')));
});
test('IDs cannot reveal inactive, test, other-company or other-location products',async()=>{
 const f=fixture(),products=await f.api.publicMenuProducts('l',['one','foreign','draft','test','elsewhere'],'a');
 assert.deepEqual(products.map(p=>p.id),['one']);
 assert.deepEqual(await f.api.publicMenuProducts('l',['one'],'b'),[]);
 await assert.rejects(f.api.publicMenuProducts('../foreign',['one'],'a'));
});
test('disabled native locations and suspended brands do not read products',async()=>{
 for(const path of ['locations/l','brands/a']){
  const f=fixture();Object.assign(f.rows.get(path),path.startsWith('locations')?{isActive:false}:{status:'suspended'});
  assert.deepEqual(await f.api.publicMenuProducts('l',['one'],'a'),[]);assert.deepEqual(f.queries,[]);
 }
});
