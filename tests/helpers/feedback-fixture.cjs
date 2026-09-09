const {loadTs}=require('./load-ts.cjs');
const {Timestamp}=require('firebase-admin/firestore');
const stamp=()=>Timestamp.fromDate(new Date('2026-09-09T10:00:00Z'));
const questions=[{questionId:'rating',label:'Hvordan var besøget?',type:'stars',isRequired:true},{questionId:'nps',label:'Vil du anbefale os?',type:'nps',isRequired:false},{questionId:'text',label:'Kommentar',type:'text',isRequired:false}];
function fixture(){
 const records=new Map([['feedbackQuestionsVersion/v1',{id:'stale-id',versionLabel:'Besøg',isActive:true,language:'da',orderTypes:['pickup','booking'],questions,createdAt:stamp(),updatedAt:stamp()}],['feedbackQuestionsVersion/en',{versionLabel:'English',isActive:true,language:'en',orderTypes:['pickup'],questions}],['integrationFeedbackInvitations/i',{status:'active',organizationId:'b',customerId:'c',bookingId:'booking',locationId:'l'}]]);
 const failure={write:false,auth:false};let sequence=0,queue=Promise.resolve();const writes=[];
 const snap=key=>({id:key.split('/')[1],exists:records.has(key),data:()=>records.has(key)?{...records.get(key)}:undefined});
 function query(name,filters=[]){return{_query:true,where:(field,op,value)=>query(name,[...filters,[field,op,value]]),get:async()=>{
  const docs=[...records.keys()].filter(key=>key.startsWith(name+'/')&&filters.every(([field,op,value])=>op==='array-contains'?records.get(key)[field]?.includes(value):records.get(key)[field]===value)).map(snap);return{docs,empty:!docs.length};
 },doc:(id='new'+(++sequence))=>{
  const key=name+'/'+id;function write(data,kind){
   if(failure.write)throw Error('Synthetic write failure');
   if(kind==='create'&&records.has(key)||kind==='update'&&!records.has(key))throw Error('Invalid document existence');
   records.set(key,{...(kind==='create'?{}:records.get(key)),...data});writes.push(key);
  }
  return{id,key,get:async()=>snap(key),create:async data=>write(data,'create'),update:async data=>write(data,'update'),set:async data=>write(data,'set'),delete:async()=>records.delete(key)};
 }};}
 const db={collection:query,runTransaction:fn=>{
  const run=queue.then(async()=>{const pending=[];const result=await fn({get:ref=>ref.get(),create:(ref,data)=>pending.push(()=>ref.create(data)),update:(ref,data)=>pending.push(()=>ref.update(data)),set:(ref,data)=>pending.push(()=>ref.set(data))});for(const write of pending)await write();return result;});queue=run.catch(()=>{});return run;
 }};
 const order={id:'order',customerDetails:{id:'c'},brandId:'b',locationId:'l',deliveryType:'Pickup'};
 const mocks={'server-only':{},'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:url=>{throw Object.assign(Error('redirect'),{digest:'NEXT_REDIRECT',url});}},
  '@/lib/firebase-admin':{getAdminDb:()=>db,getAdminFieldValue:()=>({serverTimestamp:stamp}),admin:{firestore:{FieldValue:{serverTimestamp:stamp}}}},
  '@/lib/permissions':{hasPermission:()=>!failure.auth},
  '@/app/checkout/order-actions':{getOrderById:async id=>id==='order'?order:null},
  '@/lib/integrations/esmeralda-feedback-integration':{resolveBookingFeedbackInvitationToken:async token=>token==='valid'?{booking_id:'booking',customer_id:'c',organization_id:'b',location_id:'l',invitation_id:'i'}:null},
 };
 return{records,writes,failure,questions,db,admin:loadTs('src/app/superadmin/feedback/actions.ts',mocks),public:loadTs('src/app/feedback/actions.ts',mocks),store:loadTs('src/lib/feedback/question-store.ts',mocks)};
}
function versionForm(overrides={}){
 const values={versionLabel:'Ny version',isActive:'',language:'da',orderTypes:['delivery'],questions:JSON.stringify(questions),...overrides};const form=new FormData();
 for(const [key,value]of Object.entries(values))for(const item of Array.isArray(value)?value:[value])if(item!==undefined)form.append(key,item);
 return form;
}
function responseForm(overrides={}){
 const form=new FormData();for(const [key,value]of Object.entries({sourceType:'commerce_order',sourceId:'order',customerId:'c',questionVersionId:'v1',language:'da',responses:JSON.stringify({rating:{answer:5}}),...overrides}))form.set(key,value);return form;
}
module.exports={fixture,versionForm,responseForm,questions};
