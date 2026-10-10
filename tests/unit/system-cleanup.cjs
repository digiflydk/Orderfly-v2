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
 const saved=f.records.get('cookie_texts/text');assert.equal(saved.brand_id,undefined);assert.equal(saved.extra,'preserved');assert.equal(saved.categories.statistics.title,'Text');assert.equal(saved.categories.marketing.title,'Text');assert.ok(f.calls.includes('storefront'));
});
test('invalid version, fields, language and scope cannot write; storage errors return feedback',async()=>{
 for(const [key,value] of [['consent_version','old'],['banner_title',' '],['cat_marketing_desc',''],['language','en-GB'],['id','a/b'],['brand_id','missing']]){
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
 const query={where:()=>query,get:async()=>({docs:rows.map(row=>({data:()=>row}))})};
 const api=loadTs('src/app/api/public/cookie-texts/route.ts',{'@/lib/firebase-admin':{getAdminDb:()=>({collection:()=>query})},'next/cache':{unstable_cache:fn=>fn}});
 const read=async(language='da')=>(await api.GET(new Request('https://fixture.test/?brandId=brand&language='+language))).json();
 rows=[{banner_title:'Global'},{brand_id:'brand',banner_title:'Brand'}];assert.equal((await read()).banner_title,'Brand');
 rows=[{banner_title:'Global'}];assert.equal((await read()).banner_title,'Global');
 rows=[];assert.equal((await read()).banner_title,'Vi bruger cookies');assert.equal((await read('en')).modal_title,'Cookie preferences');
});
