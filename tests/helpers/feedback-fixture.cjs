const {loadTs}=require('./load-ts.cjs');
const {Timestamp}=require('firebase-admin/firestore');
process.env.ORDERFLY_FEEDBACK_ACCESS=JSON.stringify([{uid:'qa-platform',role:'platform_admin'},{uid:'qa-editor',role:'brand_editor',brandIds:['b']},{uid:'qa-viewer',role:'brand_viewer',brandIds:['b']}]);
const stamp=()=>Timestamp.fromDate(new Date('2026-09-09T10:00:00Z'));
const questions=[{questionId:'rating',label:'Hvordan var besøget?',type:'stars',isRequired:true},{questionId:'nps',label:'Vil du anbefale os?',type:'nps',isRequired:false},{questionId:'text',label:'Kommentar',type:'text',isRequired:false}];
function fixture(){
 const records=new Map([['feedbackQuestionsVersion/v1',{id:'stale-id',versionLabel:'Besøg',isActive:true,language:'da',orderTypes:['pickup','booking'],questions,createdAt:stamp(),updatedAt:stamp()}],['feedbackQuestionsVersion/en',{versionLabel:'English',isActive:true,language:'en',orderTypes:['pickup'],questions}],['integrationFeedbackInvitations/i',{status:'active',organizationId:'b',customerId:'c',bookingId:'booking',locationId:'l'}]]);
 records.set('brands/b',{name:'Esmeralda QA',slug:'esmeralda',status:'active'});records.set('brands/other',{name:'Other Brand',slug:'other',status:'active'});
 records.set('locations/l',{brandId:'b',name:'Amager',slug:'amager',isActive:true});records.set('locations/l2',{brandId:'b',name:'Hellerup',slug:'hellerup',isActive:true});records.set('locations/foreign',{brandId:'other',name:'Foreign',slug:'foreign',isActive:true});
 records.set('customers/c',{brandId:'b',fullName:'QA Guest',email:'private@example.test',phone:'12345678'});
 const auth={uid:'qa-platform',cookie:true};const reads=[];
 const failure={write:false,auth:false,read:false};let sequence=0,queue=Promise.resolve();const writes=[];
 const snap=key=>({id:key.split('/')[1],ref:query(key.split('/')[0]).doc(key.split('/')[1]),exists:records.has(key),data:()=>records.has(key)?{...records.get(key)}:undefined,get:field=>records.get(key)?.[field]});
 const scalar=value=>value?.toMillis?value.toMillis():value instanceof Date?value.getTime():value;
 function query(name,filters=[],maximum=Infinity,sort=null,after=null){return{_query:true,
  where:(field,op,value)=>query(name,[...filters,[field,op,value]],maximum,sort,after),
  limit:value=>query(name,filters,value,sort,after),orderBy:(field,direction='asc')=>query(name,filters,maximum,[field,direction],after),startAfter:value=>query(name,filters,maximum,sort,value),
  get:async()=>{
   reads.push({collection:name,filters});if(failure.read)throw Error('Synthetic read failure');
   let keys=[...records.keys()].filter(key=>key.startsWith(name+'/')&&filters.every(([field,op,value])=>{
    const actual=records.get(key)[field],a=scalar(actual),b=scalar(value);
    return op==='array-contains'?actual?.includes(value):op==='>='?a>=b:op==='<'?a<b:op==='<='?a<=b:op==='>'?a>b:a===b;
   }));
   if(sort)keys.sort((a,b)=>{const field=sort[0],av=field==='__name__'?a.split('/')[1]:scalar(records.get(a)[field]),bv=field==='__name__'?b.split('/')[1]:scalar(records.get(b)[field]);return(av<bv?-1:av>bv?1:0)*(sort[1]==='desc'?-1:1);});
   if(after)keys=keys.filter(key=>key.split('/')[1]>after);
   const docs=keys.slice(0,maximum).map(snap);return{docs,size:docs.length,empty:!docs.length};
  },doc:(id='new'+(++sequence))=>{
   const key=name+'/'+id;function write(data,kind){
    if(failure.write)throw Error('Synthetic write failure');
    if(kind==='create'&&records.has(key)||kind==='update'&&!records.has(key))throw Error('Invalid document existence');
    records.set(key,{...(kind==='create'?{}:records.get(key)),...data});writes.push(key);
   }
   return{id,key,get:async()=>{reads.push({key});return snap(key);},create:async data=>write(data,'create'),update:async data=>write(data,'update'),set:async data=>write(data,'set'),delete:async()=>{if(failure.write)throw Error('Synthetic write failure');records.delete(key);writes.push(key);}};
  }
 };}
 const db={collection:query,runTransaction:fn=>{
  const run=queue.then(async()=>{const pending=[];const result=await fn({get:ref=>ref.get(),create:(ref,data)=>pending.push(()=>ref.create(data)),update:(ref,data)=>pending.push(()=>ref.update(data)),set:(ref,data)=>pending.push(()=>ref.set(data)),delete:ref=>pending.push(()=>ref.delete())});const before=new Map(records),writeCount=writes.length;try{for(const write of pending)await write();}catch(error){records.clear();for(const[key,value]of before)records.set(key,value);writes.length=writeCount;throw error;}return result;});queue=run.catch(()=>{});return run;
 }};
 const order={id:'order',customerDetails:{id:'c'},brandId:'b',locationId:'l',deliveryType:'Pickup',status:'Completed',paymentStatus:'Paid'};
 records.set('orders/order',order);
 const mocks={'server-only':{},'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:url=>{throw Object.assign(Error('redirect'),{digest:'NEXT_REDIRECT',url});}},
  'next/headers':{cookies:async()=>({get:()=>auth.cookie?{value:'synthetic-session'}:undefined})},
  '@/lib/firebase-admin':{getAdminApp:()=>({auth:()=>({verifySessionCookie:async()=>{if(failure.auth)throw Error('Invalid session');return{uid:auth.uid};}})}),getAdminDb:()=>db,getAdminFieldValue:()=>({serverTimestamp:stamp}),admin:{firestore:{FieldValue:{serverTimestamp:stamp}}}},
  '@/lib/permissions':{hasPermission:()=>!failure.auth},
  '@/app/checkout/order-actions':{getOrderById:async id=>records.has('orders/'+id)?{...records.get('orders/'+id),id}:null},
  '@/lib/integrations/esmeralda-feedback-integration':{resolveBookingFeedbackInvitationToken:async token=>token==='valid'?{booking_id:'booking',customer_id:'c',organization_id:'b',location_id:'l',invitation_id:'i',starts_at:'2026-01-01T10:00:00Z',status:records.get('integrationFeedbackInvitations/i')?.status}:null},
 };
 const mailProvider=loadTs('src/lib/feedback/mail-provider.ts',mocks);mocks['./mail-provider']=mailProvider;
 return{mocks,mailProvider,mailQueue:loadTs('src/lib/feedback/mail-queue.ts',mocks),mailWorker:loadTs('src/lib/feedback/mail-worker.ts',mocks),mailAdmin:loadTs('src/lib/feedback/mail-admin.ts',mocks),invitations:loadTs('src/lib/feedback/order-invitations.ts',mocks),records,writes,reads,auth,failure,questions,db,access:loadTs('src/lib/feedback/access.ts',mocks),report:loadTs('src/lib/feedback/report.ts',mocks),settings:loadTs('src/lib/feedback/settings.ts',mocks),reviews:loadTs('src/lib/feedback/public-reviews.ts',mocks),admin:loadTs('src/app/superadmin/feedback/actions.ts',mocks),public:loadTs('src/app/feedback/actions.ts',mocks),store:loadTs('src/lib/feedback/question-store.ts',mocks)};
}
function versionForm(overrides={}){
 const values={versionLabel:'Ny version',isActive:'',scope:'default',language:'da',orderTypes:['delivery'],questions:JSON.stringify(questions),...overrides};const form=new FormData();
 for(const [key,value]of Object.entries(values))for(const item of Array.isArray(value)?value:[value])if(item!==undefined)form.append(key,item);
 return form;
}
function responseForm(overrides={}){
 const form=new FormData();for(const [key,value]of Object.entries({sourceType:'commerce_order',sourceId:'order',customerId:'c',questionVersionId:'v1',language:'da',responses:JSON.stringify({rating:{answer:5}}),...overrides}))form.set(key,value);return form;
}
module.exports={fixture,versionForm,responseForm,questions};
