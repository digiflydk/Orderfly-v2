const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const texts=loadTs('src/lib/cookie-texts.ts');
function fixture(allowed=true){
 const records=new Map([['cookie_texts/text',{brand_id:'brand',extra:'preserved'}],['brands/brand',{}]]),calls=[];
 const deleted=Symbol('delete');let fail=false;
 const db={path:''},doc=(parent,...parts)=>({path:[parent.path,...parts].filter(Boolean).join('/'),id:parts.at(-1)||'new'});
 const api=loadTs('src/app/superadmin/settings/cookie-texts/actions.ts',{
  '@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{if(!allowed)throw Error('forbidden');}},
  '@/lib/server/firestore-compat':{db,doc,collection:doc,query:ref=>ref,orderBy:()=>{},deleteField:()=>deleted,Timestamp:{now:()=>({toDate:()=>new Date()})},
   getDocs:async()=>{calls.push('read');return{docs:[]};},getDoc:async ref=>{calls.push('read');return{exists:()=>records.has(ref.path),data:()=>records.get(ref.path)};},
   setDoc:async(ref,value)=>{if(fail)throw Error('offline');calls.push('write');const saved={...records.get(ref.path),...value};for(const k of Object.keys(saved))if(saved[k]===deleted)delete saved[k];records.set(ref.path,saved);}},
  '@/lib/firebase-admin':{getAdminDb:()=>({
   collection:name=>({doc:id=>({path:name+'/'+id}),where:(field,operator,value)=>({collection:name,field,value})}),
   runTransaction:async run=>{const writes=[];const result=await run({
    get:async ref=>{calls.push('read');if(ref.collection)return {docs:[...records].filter(([path,data])=>path.startsWith(ref.collection+'/')&&data[ref.field]===ref.value).map(([path,data])=>({id:path.split('/')[1],data:()=>data}))};return {exists:records.has(ref.path)};},
    set:(ref,value)=>writes.push([ref,value]),
   });if(fail)throw Error('offline');for(const [ref,value]of writes){calls.push('write');const saved={...records.get(ref.path),...value};for(const k of Object.keys(saved))if(saved[k]===deleted)delete saved[k];records.set(ref.path,saved);}return result;},
  })},
  'next/cache':{revalidatePath:()=>{},revalidateTag:tag=>calls.push(tag)},'next/navigation':{redirect:()=>{throw Error('redirect');}},
 });
 const form=()=>{const f=new FormData();f.set('id','text');f.set('language','da');f.set('consent_version',texts.APP_VERSION);
 for(const key of ['banner_title','banner_description','accept_all_button','customize_button','modal_title','modal_description','save_preferences_button','modal_accept_all_button'])f.set(key,'Text');
 for(const cat of ['necessary','functional','statistics','marketing'])for(const part of ['title','desc'])f.set(`cat_${cat}_${part}`,'Text');return f;};
 return {api,form,calls,records,fail:()=>{fail=true;}};
}
test('cookie administration reads and writes require superuser before IO',async()=>{
 const f=fixture(false);for(const call of [()=>f.api.getCookieTexts(),()=>f.api.getCookieTextById('text'),()=>f.api.createOrUpdateCookieTexts(f.form())])await assert.rejects(call(),/forbidden/);assert.deepEqual(f.calls,[]);
});
test('changing brand text to global clears the stored brand and invalidates storefront cache',async()=>{
 const f=fixture();await assert.rejects(f.api.createOrUpdateCookieTexts(f.form()),/redirect/);
 const saved=f.records.get('cookie_texts/text');assert.equal(saved.brand_id,undefined);assert.equal(saved.global_locale_key,'da');assert.equal(saved.extra,'preserved');assert.equal(saved.categories.statistics.title,'Text');assert.equal(saved.categories.marketing.title,'Text');assert.ok(f.calls.includes('storefront'));
});
test('invalid version, fields, language and scope cannot write; storage errors return feedback',async()=>{
 for(const [key,value] of [['consent_version','old'],['banner_title',' '],['cat_marketing_desc',''],['language','invalid'],['id','a/b'],['brand_id','missing']]){
  const f=fixture(),form=f.form();form.set(key,value);assert.ok((await f.api.createOrUpdateCookieTexts(form)).error);assert.ok(!f.calls.includes('write'));
 }
 const f=fixture();f.fail();assert.match((await f.api.createOrUpdateCookieTexts(f.form())).error,/could not be saved/);
});
test('existing brand selection remains scoped and retains active consent version',async()=>{
 const f=fixture(),form=f.form();form.set('brand_id','brand');await assert.rejects(f.api.createOrUpdateCookieTexts(form),/redirect/);assert.equal(f.records.get('cookie_texts/text').brand_id,'brand');assert.equal(f.records.get('cookie_texts/text').consent_version,texts.APP_VERSION);
});
test('localized defaults and blank legacy category fields retain usable storefront text',()=>{
 assert.equal(texts.getDefaultCookieTexts('da-DK').banner_title,'Vi bruger cookies');assert.equal(texts.getDefaultCookieTexts('en').modal_title,'Cookie preferences');
 const result=texts.mergeCookieTexts({language:'en',banner_title:'',categories:{marketing:{title:'',description:''}}},'en');assert.equal(result.banner_title,'We use cookies');assert.equal(result.categories.marketing.title,'Marketing');assert.ok(result.categories.marketing.description);
});
test('old documentation bookmark requires authorization before redirecting',async()=>{
 let allowed=false;const redirects=[];const page=loadTs('src/app/superadmin/docs/[[...section]]/page.tsx',{'@/lib/access/orderfly-session':{requirePlatformSuperuser:async()=>{if(!allowed)throw Error('forbidden');}},'next/navigation':{redirect:href=>{redirects.push(href);throw Error('redirect');}}}).default;
 await assert.rejects(page(),/forbidden/);assert.deepEqual(redirects,[]);allowed=true;await assert.rejects(page(),/redirect/);assert.deepEqual(redirects,['/superadmin/settings']);
});
test('public cookie API prefers brand text, falls back to global and localizes absent rows',async()=>{
 let rows=[];
 const query={where:()=>query,get:async()=>({docs:rows.map(row=>({data:()=>({consent_version:texts.APP_VERSION,...row})}))})};
 const api=loadTs('src/app/api/public/cookie-texts/route.ts',{'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>query})},'next/cache':{unstable_cache:fn=>fn}});
 const read=async(language='da')=>(await api.GET(new Request('https://fixture.test/?brandId=brand&language='+language))).json();
 rows=[{language:'da',banner_title:'Global'},{language:'da',brand_id:'brand',banner_title:'Brand'}];assert.equal((await read()).banner_title,'Brand');
 rows=[{language:'da',banner_title:'Global'}];assert.equal((await read()).banner_title,'Global');
 rows=[];assert.equal((await read()).banner_title,'Vi bruger cookies');assert.equal((await read('en')).modal_title,'Cookie preferences');
});

test('blank or partial Statistics preserves each customized legacy Analytics field',()=>{
 const result=texts.mergeCookieTexts({categories:{statistics:{title:' ',description:'Current description'},analytics:{title:'Custom legacy title',description:'Custom legacy description'}}});
 assert.equal(result.categories.statistics.title,'Custom legacy title');assert.equal(result.categories.statistics.description,'Current description');
 const empty=texts.mergeCookieTexts({categories:{statistics:{title:'',description:''},analytics:{title:'Custom title',description:'Custom description'}}});
 assert.deepEqual(empty.categories.statistics,{title:'Custom title',description:'Custom description'});
});
test('regional language codes save and duplicate target scope is rejected without writes',async()=>{
 for(const language of ['en-US','da-DK']){const f=fixture(),form=f.form();form.set('language',language);await assert.rejects(f.api.createOrUpdateCookieTexts(form),/redirect/);assert.equal(f.records.get('cookie_texts/text').language,language);}
 for(const brand_id of [undefined,'brand']){
  const f=fixture(),form=f.form();form.set('language','en-US');if(brand_id)form.set('brand_id',brand_id);
  f.records.set('cookie_texts/other',{consent_version:texts.APP_VERSION,language:'en-us',...(brand_id?{brand_id}:{})});
  assert.match((await f.api.createOrUpdateCookieTexts(form)).error,/already exist/);assert.ok(!f.calls.includes('write'));assert.equal(f.records.get('cookie_texts/text').brand_id,'brand');
 }
});
test('regional public locale selects existing regional text before base-language fallback',async()=>{
 let rows=[{language:'en',banner_title:'Base'},{language:'en-US',banner_title:'Regional'}];
 const query={where:()=>query,get:async()=>({docs:rows.map(row=>({data:()=>({consent_version:texts.APP_VERSION,...row})}))})};
 const api=loadTs('src/app/api/public/cookie-texts/route.ts',{'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>query})},'next/cache':{unstable_cache:fn=>fn}});
 const read=async()=>(await api.GET(new Request('https://fixture.test/?brandId=brand&language=en-US'))).json();
 assert.equal((await read()).banner_title,'Regional');rows=rows.slice(0,1);assert.equal((await read()).banner_title,'Base');
});

test('brand query is scoped and legacy global locale lookup is shared across brands',async()=>{
 const calls=[];
 const query={where:(field,op,value)=>{calls.push({field,op,value});return{get:async()=>({docs:[]})};}};
 const api=loadTs('src/app/api/public/cookie-texts/route.ts',{'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>query})},
  'next/cache':{unstable_cache:fn=>{const cache=new Map();return(...args)=>{const key=JSON.stringify(args);if(!cache.has(key))cache.set(key,fn(...args));return cache.get(key);};}}});
 for(const brand of ['first','second'])await api.GET(new Request('https://fixture.test/?brandId='+brand+'&language=en-US'));
 assert.deepEqual(calls.filter(x=>x.field==='brand_id').map(x=>x.value),['first','second']);
 const globals=calls.filter(x=>x.field==='global_locale_key');assert.equal(globals.length,1);assert.equal(globals[0].op,'in');assert.ok(globals[0].value.includes('en-us'));assert.ok(globals[0].value.includes('en'));assert.ok(globals[0].value.length<=20);
});

test('moving global text to brand scope removes the public global index key',async()=>{
 const f=fixture(),form=f.form();f.records.set('cookie_texts/text',{global_locale_key:'da'});form.set('brand_id','brand');
 await assert.rejects(f.api.createOrUpdateCookieTexts(form),/redirect/);assert.equal(f.records.get('cookie_texts/text').global_locale_key,undefined);
});
test('global metadata backfill is preview-first, preserves all text and is idempotent',async()=>{
 const {backfill}=require('../../scripts/backfill-global-cookie-index.cjs');
 const rows=new Map([['global',{language:'da-DK',banner_title:'Keep custom text',consent_version:'old'}],['brand',{brand_id:'b',language:'da',banner_title:'Brand'}]]);
 const snap=id=>({id,exists:rows.has(id),data:()=>({...rows.get(id)})});
 const db={collection:()=>({get:async()=>({docs:[...rows.keys()].map(snap)}),doc:id=>id}),runTransaction:async run=>run({get:async id=>snap(id),update:(id,value)=>rows.set(id,{...rows.get(id),...value})})};
 const before=structuredClone(rows),preview=await backfill(db);assert.equal(preview.pending,1);assert.deepEqual(rows,before);
 assert.deepEqual((await backfill(db,true,preview.manifest)).recordIds,['global']);assert.deepEqual(rows.get('global'),{...before.get('global'),global_locale_key:'da-dk'});assert.deepEqual(rows.get('brand'),before.get('brand'));
 assert.equal((await backfill(db)).pending,0);
});
test('backfill aborts before writes for invalid locales and rechecks concurrent scope changes',async()=>{
 const {backfill}=require('../../scripts/backfill-global-cookie-index.cjs');let writes=0;
 const db={collection:()=>({get:async()=>({docs:[{id:'global',data:()=>({language:'da'})}]}),doc:id=>id}),runTransaction:async run=>run({get:async()=>({exists:true,data:()=>({brand_id:'now-brand',language:'da'})}),update:()=>writes++})};
 await assert.rejects(backfill(db,true,(await backfill(db)).manifest),/scope changed/);assert.equal(writes,0);
 const invalid={collection:()=>({get:async()=>({docs:[{id:'bad',data:()=>({language:'invalid'})}]})})};await assert.rejects(backfill(invalid,true),/invalid language/);
});

test('backfill requires the exact reviewed set before writing',async()=>{
 const {backfill}=require('../../scripts/backfill-global-cookie-index.cjs');
 for(const change of ['added','removed','changed','version','missing']){
  const rows=new Map([['global',{language:'da',banner_title:'Reviewed'}]]);let writes=0,version=1;
  const snap=id=>({id,exists:rows.has(id),data:()=>({...rows.get(id)}),...(change==='version'?{updateTime:{seconds:version,nanoseconds:0}}:{})});
  const db={collection:()=>({get:async()=>({docs:[...rows.keys()].map(snap)}),doc:id=>id}),runTransaction:async()=>{writes++;}};
  const preview=await backfill(db);
  if(change==='added')rows.set('new',{language:'en'});
  if(change==='removed')rows.delete('global');
  if(change==='changed')rows.get('global').banner_title='Unreviewed';
  if(change==='version')version++;
  await assert.rejects(backfill(db,true,change==='missing'?undefined:preview.manifest),/manifest missing or records changed/);
  assert.equal(writes,0);
 }
});
