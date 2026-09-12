const {loadTs} = require('./load-ts.cjs');
const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const brand = {id:'b',ownerId:'u',name:'Esmeralda QA',companyName:'QA Pizza ApS',slug:'esmeralda-qa',
  street:'Testvej 1',zipCode:'2300',city:'København',country:'DK',currency:'DKK',companyRegNo:'12345678',
  status:'active',locationsCount:2,foodCategories:[],bagFee:4,vatPercentage:25};
const location = {id:'l',brandId:'missing-brand',name:'Esmeralda QA Amager',slug:'amager',street:'Testvej 1',
  zipCode:'2300',city:'København',country:'DK',isActive:false,allowPreOrder:false,deliveryFee:0,minOrder:0,
  deliveryTypes:['pickup'],prep_time:15,delivery_time:20,travlhed_factor:'normal',manual_override:0,
  openingHours:Object.fromEntries(days.map(day=>[day,{isOpen:day==='monday',open:'11:00',close:'22:00'}]))};
function fixture(seed,allowed=true) {
 const records = new Map(seed || [['brands/b',{...brand}],['brands/c',{...brand,id:'c',name:'CPH QA',slug:'cph-qa',companyRegNo:'87654321'}],['locations/l',structuredClone(location)]]);
 const writes=[],invalidations=[];
 const snap=key=>({id:key.split('/').pop(),exists:records.has(key),data:()=>structuredClone(records.get(key))});
 const ref=key=>({key,id:key.split('/').pop(),get:async()=>snap(key),set:async(data)=>{records.set(key,{...records.get(key),...structuredClone(data)});writes.push(key);},update:async(data)=>{if(!records.has(key))throw Error('not found');records.set(key,{...records.get(key),...structuredClone(data)});writes.push(key);}});
 function collection(name,filters=[],orderedBy,cap=Infinity) {
  return {doc:(id='new')=>ref(name+'/'+id),where:(field,op,value)=>collection(name,[...filters,[field,value]],orderedBy,cap),
   orderBy:field=>collection(name,filters,field,cap),limit:n=>collection(name,filters,orderedBy,n),get:async()=>{
    const docs=[...records.keys()].filter(key=>key.startsWith(name+'/')&&key.split('/').length===2)
     .filter(key=>filters.every(([field,value])=>records.get(key)[field]===value))
     .filter(key=>!orderedBy||records.get(key)[orderedBy]!==undefined).slice(0,cap).map(snap);
    return {docs,size:docs.length,empty:docs.length===0};
   }};
 }
 const db={collection,runTransaction:async fn=>{
  const pending=[];const result=await fn({get:ref=>ref.get(),set:(ref,data)=>pending.push([ref,data])});
  for(const [ref,data] of pending)await ref.set(data);return result;
 }};
 const mocks={'server-only':{},'@/lib/firebase-admin':{getAdminDb:()=>db},
  '@/lib/permissions':{hasPermission:()=>allowed},'next/cache':{revalidatePath:(...args)=>invalidations.push(args),revalidateTag:()=>{}},
  'next/navigation':{redirect:path=>{const error=Error('redirect');error.digest='NEXT_REDIRECT;replace;'+path+';307;';throw error;}}};
 return {records,writes,invalidations,users:loadTs('src/app/superadmin/users/actions.ts',mocks),plans:loadTs('src/app/superadmin/subscriptions/actions.ts',mocks),roles:loadTs('src/roles/actions.ts',mocks),brands:loadTs('src/app/superadmin/brands/actions.ts',mocks),locations:loadTs('src/app/superadmin/locations/actions.ts',mocks)};
}
function formData(data) {
 const form = new FormData();
 for(const [key,value] of Object.entries(data)){
  if(value===undefined)continue;
  if(key==='openingHours'){for(const [day,hours] of Object.entries(value))for(const [field,item] of Object.entries(hours))form.append(`openingHours.${day}.${field}`,String(item));}
  else if(Array.isArray(value)){for(const item of value)form.append(key,String(item));}
  else form.append(key,String(value));
 }
 return form;
}
module.exports={fixture,formData,brand,location};
