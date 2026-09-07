const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
function load(path,mocks={}) {
  const mod={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  new Function('require','module','exports',code)(name=>name in mocks?mocks[name]:require(name),mod,mod.exports);
  return mod.exports;
}
const {upsellFormData}=load('src/lib/upsell-form-data.ts');
const values={brandId:'brand-cph',locationIds:['location-m3'],upsellName:'Andre købte også',description:'',imageUrl:'',offerType:'product',offerProductIds:['p1','p2'],offerCategoryIds:[],discountType:'none',isActive:true,orderTypes:['pickup','delivery'],activeDays:['monday'],tags:['Popular'],triggerConditions:[{id:'t1',type:'cart_value_over',referenceId:'100'}],activeTimeSlots:[{start:'11:00',end:'22:00'}],startDate:new Date('2026-09-07T09:00:00Z')};
test('controlled create values satisfy the real server parser and persist native IDs',async()=>{
  let saved;
  const api=load('src/app/superadmin/upsells/actions.ts',{
    '@/lib/promotion-rules':{},'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:()=>{throw Error('REDIRECT');}},'../products/actions':{},
    '@/lib/firebase-admin':{admin:{firestore:{Timestamp:{now:()=>0,fromDate:d=>d.toISOString()}}},getAdminDb:()=>({collection:()=>({doc:()=>({id:'new-upsell',set:async data=>{saved=data;}})})})},
  });
  await assert.rejects(api.createOrUpdateUpsell(null,upsellFormData(values)),/REDIRECT/);
  assert.equal(saved.brandId,'brand-cph');
  assert.deepEqual(saved.locationIds,['location-m3']);
  assert.deepEqual(saved.offerProductIds,['p1','p2']);
  assert.deepEqual(saved.orderTypes,['pickup','delivery']);
  assert.deepEqual(saved.triggerConditions,values.triggerConditions);
  assert.deepEqual(saved.activeTimeSlots,values.activeTimeSlots);
  assert.equal(saved.startDate,values.startDate.toISOString());
  saved=null;
  const invalid=await api.createOrUpdateUpsell(null,upsellFormData({...values,locationIds:[]}));
  assert.equal(invalid.error,true);assert.equal(saved,null);
  assert.ok(invalid.errors.some(e=>e.path[0]==='locationIds'));
});
test('edit includes locked brand and preserves category offer / unchecked activation',()=>{
  const data=upsellFormData({...values,isActive:false,offerType:'category',offerCategoryIds:['c1'],offerProductIds:[],discountType:'percentage',discountValue:10},'existing');
  assert.equal(data.get('id'),'existing');assert.equal(data.get('brandId'),'brand-cph');
  assert.equal(data.has('isActive'),false);assert.equal(data.get('discountValue'),'10');
  assert.deepEqual(data.getAll('offerCategoryIds'),['c1']);assert.deepEqual(data.getAll('offerProductIds'),[]);
});
test('actual form prevents native reset, keeps Hellerup on failed submit and retries',()=>{
  const path='src/components/superadmin/upsell-form-page.tsx';
  const ui=new Proxy({}, {get:(_,key)=>key});
  const mocks=Object.fromEntries([...fs.readFileSync(path,'utf8').matchAll(/from ['"]([^'"]+)['"]/g)].map(m=>[m[1],ui]));
  let pending=false, serverState=null, attempts=[];
  const draft=structuredClone(values);
  const form={control:{},watch:key=>draft[key],getValues:()=>draft,setValue:(key,value)=>draft[key]=value,formState:{}};
  Object.assign(mocks,{
    zod:require('zod'),'@hookform/resolvers/zod':{zodResolver:()=>{}},
    'react-hook-form':{useForm:()=>form,useFieldArray:()=>({fields:[]})},
    react:{useEffect:()=>{},useMemo:fn=>fn(),useState:v=>[v,()=>{}],useTransition:()=>[pending,fn=>fn()],useActionState:()=>[serverState,data=>{attempts.push(data);serverState={error:true,message:'Correct trigger'};},pending]},
    '@/hooks/use-toast':{useToast:()=>({toast:()=>{}})},'@/lib/upsell-form-data':{upsellFormData},
  });
  const {UpsellFormPage}=load(path,mocks);
  const render=()=>UpsellFormPage({brands:[],locations:[],products:[],categories:[]}).props.children;
  let prevented=0;
  const event={preventDefault:()=>{prevented++;}};
  const first=render();assert.equal(first.props.action,undefined);
  first.props.onSubmit(event);
  assert.equal(prevented,1);assert.deepEqual(draft.locationIds,['location-m3']);
  render().props.onSubmit(event);
  assert.equal(attempts.length,2);
  assert.deepEqual(attempts[1].getAll('locationIds'),['location-m3']);
  pending=true;render().props.onSubmit(event);assert.equal(attempts.length,2);
});
