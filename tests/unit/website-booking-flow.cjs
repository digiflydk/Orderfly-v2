const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const {JSDOM}=require('jsdom'),{randomUUID}=require('node:crypto');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)))));
const html=Buffer.from(payload['/bordbooking'].data,'base64').toString();
const script=fs.readFileSync('preview/esmeralda/adapters/website-booking.js','utf8');
const FLOW='esmeralda_booking_flow_v3',vip='vip_room_kr_ver_minimum_6_personers_booking';
const field={id:'33333333-3333-4333-8333-333333333333',field_type:'checkbox',is_required:false,allow_multiple:false,label:'Synthetic preference',options:[{option_value:vip,option_label:'VIP',min_party_size:6,requires_staff_confirmation:true}]};
const acknowledgement={ok:true,found:true,booking_id:'synthetic-booking',booking_reference:'SYNTHETIC-001',starts_at:'2026-12-01T17:00:00Z',party_size:6,status:'confirmed',tracking_event_id:'synthetic-event',is_test:true};
const wait=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let n=0;n<12;n++)await wait();}
async function fixture({path='/bordbooking',saved,confirm,recover,storageFailure=false}={}){
 const dom=new JSDOM(html,{url:'https://www.esmeraldapizza.dk'+path,runScripts:'outside-only'}),w=dom.window,calls=[];
 w.AbortController=AbortController;w.crypto.randomUUID=randomUUID;
 if(saved)w.sessionStorage.setItem(FLOW,saved);
 if(storageFailure)Object.defineProperty(w,'sessionStorage',{get(){throw Error('blocked')}});
 w.fetch=async(url,options)=>{assert.equal(url,'https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/booking-api');const body=JSON.parse(options.body);calls.push({body,key:options.headers['x-idempotency-key']});let data,status=200;
  if(body.action==='fields')data={system_fields:[],fields:[field]};
  else if(body.action==='availability')data={slots:[{starts_at:body.date+'T17:00:00Z',local_time:'18:00',duration_minutes:120}]};
  else if(body.action==='confirm'){const result=confirm?await confirm(body):{data:acknowledgement};data=result.data;status=result.status||200;}
  else if(body.action==='recover'){const result=recover?await recover(body):{data:acknowledgement};data=result.data;status=result.status||200;}
  else throw Error('Unexpected action '+body.action);
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
 };
 w.eval(script);w.document.dispatchEvent(new w.Event('DOMContentLoaded'));await settle();
 const $=id=>w.document.getElementById(id),change=id=>$(id).dispatchEvent(new w.Event('change',{bubbles:true}));
 async function choose(party=6){$('eb-party').value=String(party);change('eb-party');await settle();w.document.querySelector('[data-booking-time]').click();await settle();}
 function fill(){for(const [id,value]of Object.entries({name:'Synthetic Review',phone:'00000000',email:'review@example.invalid',note:'Synthetic note'})){$('eb-'+id).value=value;$('eb-'+id).dispatchEvent(new w.Event('input',{bubbles:true}));}}
 async function submit(){ $('eb-details-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle(); }
 return{dom,w,calls,$,choose,fill,submit,close:()=>w.close()};
}
test('step URLs preserve campaign parameters; details and confirmation survive reload without new booking',async()=>{
 let f=await fixture({path:'/bordbooking?utm_campaign=booking-review'});try{await f.choose();assert.equal(f.w.location.pathname,'/bordbooking/informationer');assert.equal(f.w.location.search,'?utm_campaign=booking-review');f.fill();const saved=f.w.sessionStorage.getItem(FLOW);f.close();f=await fixture({path:'/bordbooking/informationer?utm_campaign=booking-review',saved});assert.equal(f.$('eb-name').value,'Synthetic Review');await f.submit();assert.equal(decodeURIComponent(f.w.location.pathname),'/bordbooking/bekræftelse');assert.equal(f.calls.filter(x=>x.body.action==='confirm').length,1);const complete=f.w.sessionStorage.getItem(FLOW);assert.equal(JSON.parse(complete).values,null);assert.equal(JSON.parse(complete).payload,null);f.close();f=await fixture({path:'/bordbooking/bekr%C3%A6ftelse',saved:complete});assert.equal(f.$('eb-success-step').hidden,false);assert.equal(f.calls.filter(x=>x.body.action==='confirm').length,0);assert.equal(f.calls.filter(x=>x.body.action==='recover').length,1);}finally{f.close()}
});
test('uncertain submit persists its exact request and retry key across reload',async()=>{
 let f=await fixture({confirm:async()=>({status:503,data:{error:'Synthetic timeout'}})});try{await f.choose();f.fill();await f.submit();const first=f.calls.find(x=>x.body.action==='confirm'),saved=f.w.sessionStorage.getItem(FLOW);assert.equal(JSON.parse(saved).phase,'pending');assert.equal(f.$('eb-name').disabled,true);f.close();f=await fixture({path:'/bordbooking/informationer',saved,recover:async()=>({data:{found:false}})});assert.equal(f.calls.filter(x=>x.body.action==='confirm').length,0);await f.submit();const retry=f.calls.find(x=>x.body.action==='confirm');assert.equal(retry.key,first.key);for(const key of ['party_size','starts_at','guest_name','guest_phone','guest_email','guest_note','custom_responses'])assert.deepEqual(retry.body[key],first.body[key],key);assert.equal(f.$('eb-success-step').hidden,false);}finally{f.close()}
});
test('reload of an already committed uncertain request recovers without re-submission',async()=>{
 let f=await fixture({confirm:async()=>({status:503,data:{error:'Lost acknowledgement'}})});try{await f.choose();f.fill();await f.submit();const saved=f.w.sessionStorage.getItem(FLOW);f.close();f=await fixture({saved,path:'/bordbooking/informationer'});assert.equal(f.$('eb-success-step').hidden,false);assert.equal(f.calls.filter(x=>x.body.action==='confirm').length,0);}finally{f.close()}
});
test('deep links alone cannot show success, VIP is disabled below six, and unavailable storage prevents submission',async()=>{
 for(const path of ['/bordbooking/informationer','/bordbooking/bekr%C3%A6ftelse']){const f=await fixture({path});try{assert.equal(f.w.location.pathname,'/bordbooking');assert.equal(f.$('eb-success-step').hidden,true);}finally{f.close()}}
 const f=await fixture();try{await f.choose(2);assert.equal(f.w.document.querySelector('input[value="'+vip+'"]').disabled,true);f.$('eb-back').click();await settle();await f.choose(6);assert.equal(f.w.document.querySelector('input[value="'+vip+'"]').disabled,false);}finally{f.close()}
 const blocked=await fixture({storageFailure:true});try{await blocked.choose();blocked.fill();await blocked.submit();assert.equal(blocked.calls.filter(x=>x.body.action==='confirm').length,0);assert.equal(blocked.$('eb-error').hidden,false);}finally{blocked.close()}
});
test('pending history navigation cannot restart booking, and conflict returns to selection',async()=>{
 const f=await fixture({confirm:async()=>({status:503,data:{error:'Uncertain'}})});try{await f.choose();f.fill();await f.submit();f.w.history.pushState({},'','/bordbooking');f.w.dispatchEvent(new f.w.PopStateEvent('popstate'));assert.equal(f.w.location.pathname,'/bordbooking/informationer');assert.equal(f.$('eb-back').disabled,true);}finally{f.close()}
 const conflict=await fixture({confirm:async()=>({status:409,data:{error:'Occupied'}})});try{await conflict.choose();conflict.fill();await conflict.submit();assert.equal(conflict.w.location.pathname,'/bordbooking');assert.equal(conflict.w.sessionStorage.getItem(FLOW),null);}finally{conflict.close()}
});
test('an unavailable completed booking retries only recovery, including keyboard submit',async()=>{
 let f=await fixture();try{await f.choose();f.fill();await f.submit();const saved=f.w.sessionStorage.getItem(FLOW);f.close();let attempt=0;f=await fixture({saved,path:'/bordbooking/bekr%C3%A6ftelse',recover:async()=>++attempt===1?{status:503,data:{error:'Synthetic offline'}}:{data:acknowledgement}});assert.equal(f.$('eb-success-step').hidden,true);await f.submit();assert.equal(f.$('eb-success-step').hidden,false);assert.equal(f.calls.filter(x=>x.body.action==='confirm').length,0);}finally{f.close()}
});
test('recovery reflects a subsequently cancelled booking without reserved copy',async()=>{
 let f=await fixture();try{await f.choose();f.fill();await f.submit();const saved=f.w.sessionStorage.getItem(FLOW);f.close();f=await fixture({saved,recover:async()=>({data:{...acknowledgement,status:'cancelled'}})});assert.equal(f.$('eb-success-step').hidden,false);assert.equal(f.$('eb-success-step').querySelector('.eb-eyebrow').textContent,'Bookingstatus');assert.match(f.$('eb-success-heading').textContent,/aflyst/);assert.equal(f.calls.filter(x=>x.body.action==='confirm').length,0);}finally{f.close()}
});
