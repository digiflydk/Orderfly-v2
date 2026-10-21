'use strict';
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {withQrFixture}=require('./qr-fixture.cjs');
const {chromium}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');
const sharp=require('sharp'),jsQR=require('jsqr');
const apiOnly=process.argv.includes('--api-only');let phase='seed';
const MOBILE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Copenhagen',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
withQrFixture(async({db,ids,manager,viewer,session,BASE})=>{
 const checks=[],managerCookie=await session(manager),viewerCookie=await session(viewer);checks.push('real emulator identities through unchanged native session API');
 const api=(cookie,command,origin=BASE)=>fetch(BASE+'/api/qr/admin',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify(command)});
 const draft={name:'QA0 QR persisted',brandId:ids.brand,locationId:ids.location,kind:'dynamic',destination:'https://example.com/qa0-menu',staticType:'url',fields:{},campaign:'QA0 test',tags:['qa0'],utm:{source:'local',medium:'qr',campaign:'',content:'',term:''}};
 phase='native_create';const requestId=randomUUID(),create={action:'save',draft,context:{requestId}};
 const createdResponse=await api(managerCookie,create);assert.equal(createdResponse.status,200);const created=await createdResponse.json();assert.ok(created.id);assert.equal(created.revision,'1');
 const savedRef=db.doc(`brands/${ids.brand}/qrCodes/${created.id}`);assert.equal((await savedRef.get()).data().name,draft.name);
 assert.equal((await api(managerCookie,create)).status,200);assert.equal((await db.collection(`brands/${ids.brand}/qrCodes`).get()).size,1);checks.push('native QR create and same-key replay persist one record');
 phase='native_denials';assert.equal((await api('',{action:'list'})).status,401);assert.equal((await api(managerCookie,{...create,draft:{...draft,brandId:ids.foreignBrand,locationId:ids.foreignLocation},context:{requestId:randomUUID()}})).status,403);
 assert.equal((await api(managerCookie,{...create,draft:{...draft,locationId:ids.foreignLocation},context:{requestId:randomUUID()}})).status,403);assert.equal((await api(managerCookie,create,'https://foreign.example')).status,403);checks.push('anonymous foreign brand foreign native location and CSRF rejected');
 phase='native_edit';const updatedDraft={...draft,name:'QA0 QR edited',destination:'https://example.com/qa0-updated'};
 const editedResponse=await api(managerCookie,{action:'save',draft:updatedDraft,context:{id:created.id,revision:created.revision,requestId:randomUUID()}});assert.equal(editedResponse.status,200);let current=await editedResponse.json();assert.equal(current.revision,'2');assert.equal((await savedRef.get()).data().name,updatedDraft.name);
 assert.equal((await api(managerCookie,{action:'save',draft,context:{id:created.id,revision:created.revision,requestId:randomUUID()}})).status,409);checks.push('native edit persists revision and stale revision rejects');
 phase='redirect_native_state';const qrPath=new URL(created.publicUrl).pathname,stored=(await savedRef.get()).data(),slug=qrPath.split('/').pop();
 assert.equal(stored.status,'active');assert.equal(stored.slug,slug);assert.equal(stored.expiresAt,null);assert.equal(stored.brandId,ids.brand);assert.equal(stored.locationId,ids.location);assert.equal((await db.doc('qrPublicCodes/'+slug).get()).data().codeId,created.id);
 phase='redirect_native_resolve';const {createQrStore}=loadTs('src/lib/qr/store.ts'),{normalizeDestination}=loadTs('src/lib/qr/payload.ts');assert.equal(await createQrStore(db,{normalizeDestination}).resolve(slug),(await savedRef.get()).data().destination);
 phase='redirect_persistence';
 const head=await fetch(BASE+qrPath,{method:'HEAD',redirect:'manual'});
 if(head.status!==302){const alias=await fetch(BASE+qrPath,{method:'HEAD',redirect:'manual',headers:{host:'localhost:3100'}}),get=await fetch(BASE+qrPath,{redirect:'manual',headers:{'user-agent':MOBILE}});phase=`redirect_head_${head.status}_get_${get.status}_localhost_alias_${alias.status}`;}
 assert.equal(head.status,302);
 const mobile=await fetch(BASE+qrPath,{redirect:'manual',headers:{'user-agent':MOBILE}});assert.equal(mobile.status,302);assert.equal(new URL(mobile.headers.get('location')).pathname,'/qa0-updated');assert.match(mobile.headers.get('cache-control'),/no-store/);
 const bot=await fetch(BASE+qrPath,{redirect:'manual',headers:{'user-agent':'Googlebot'}});assert.equal(bot.status,302);
 const events=await savedRef.collection('qrScanEvents').get();assert.equal(events.size,2);assert.equal(events.docs.filter(d=>d.data().classification.probableScan).length,1);checks.push('actual redirect atomically records native GET events and excludes HEAD');
 phase='analytics';const analytics={action:'analytics',brandId:ids.brand,locationId:ids.location,id:created.id,from:day(),to:day()};
 const statsResponse=await api(managerCookie,analytics);assert.equal(statsResponse.status,200);const stats=await statsResponse.json();assert.equal(stats.metrics.totalOpenings,2);assert.equal(stats.metrics.probableScans,1);assert.equal(stats.metrics.estimatedUnique,null);assert.equal(stats.currentLocationOnly,true);
 assert.equal((await api(viewerCookie,{...analytics,export:true})).status,403);assert.equal((await api(managerCookie,{...analytics,brandId:ids.foreignBrand,locationId:ids.foreignLocation})).status,403);checks.push('native analytics matches persisted events and denied exports stay denied');
 let browserErrors=0,blockedExternal=0;
 if(!apiOnly){
  phase='browser_login';const browser=await chromium.launch({executablePath:process.env.CART_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
  try{
   async function context(width=1440){const c=await browser.newContext({serviceWorkers:'block',viewport:{width,height:1000}});await c.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'&&['3100','9099','8088'].includes(u.port)?route.continue():(blockedExternal++,route.abort('blockedbyclient'));});await c.routeWebSocket('**/*',ws=>{const u=new URL(ws.url());if(u.hostname==='127.0.0.1'&&u.port==='3100')ws.connectToServer();else{blockedExternal++;ws.close();}});return c;}
   async function login(c,user){const page=await c.newPage();page.on('pageerror',()=>browserErrors++);await page.goto(BASE+'/admin-login');await page.getByRole('button',{name:'Log ind med en separat Orderfly-konto',exact:true}).click();await page.getByLabel('E-mail',{exact:true}).fill(user.email);await page.getByLabel('Adgangskode',{exact:true}).fill(user.password);
    const result=page.waitForResponse(r=>r.url()===BASE+'/api/admin/session'&&r.request().method()==='POST');await page.getByRole('button',{name:'LOG IND',exact:true}).click();assert.equal((await result).status(),200);await page.waitForURL(u=>!u.pathname.startsWith('/admin-login'));return page;}
   const own=await context();try{const page=await login(own,manager);phase='browser_qr_page';const response=await page.goto(BASE+'/superadmin/qr-codes');assert.equal(response.status(),200);await page.getByRole('heading',{name:'QR-koder',exact:true}).waitFor();
    phase='browser_create';await page.getByRole('button',{name:'Opret QR-kode',exact:true}).click();await page.getByLabel('Navn',{exact:true}).fill('QA0 QR browser create');await page.getByLabel('Placering',{exact:true}).selectOption(ids.location);await page.getByLabel('Webadresse',{exact:true}).fill('https://example.com/qa0-browser-create');await page.getByRole('button',{name:'Gem QR-kode',exact:true}).click();await page.getByRole('heading',{name:'QA0 QR browser create',exact:true}).waitFor();assert.equal((await db.collection(`brands/${ids.brand}/qrCodes`).where('name','==','QA0 QR browser create').get()).size,1);checks.push('actual browser create persists a second independent QR code');
    phase='browser_edit';
    await page.getByRole('button',{name:'Redigér QA0 QR edited',exact:true}).click();await page.getByLabel('Navn',{exact:true}).fill('QA0 QR browser');await page.getByRole('button',{name:'Gem QR-kode',exact:true}).click();await page.getByRole('heading',{name:'QA0 QR browser',exact:true}).waitFor();assert.equal((await savedRef.get()).data().name,'QA0 QR browser');checks.push('actual browser Firebase login and QR edit persist through real Next API');
    phase='browser_png_decode';await page.getByRole('button',{name:'Redigér QA0 QR browser',exact:true}).click();const downloaded=page.waitForEvent('download');await page.getByRole('form',{name:'Redigér QR-kode',exact:true}).getByRole('button',{name:'Download PNG',exact:true}).click();const file=await downloaded,raw=await sharp(await file.path()).ensureAlpha().raw().toBuffer({resolveWithObject:true});const decoded=jsQR(new Uint8ClampedArray(raw.data),raw.info.width,raw.info.height);assert.equal(decoded?.data,created.publicUrl);checks.push('actual browser PNG download decodes to permanent QR public URL');
   }finally{await own.close();}
   const limited=await context(390);try{phase='browser_viewer';const page=await login(limited,viewer);await page.goto(BASE+'/superadmin/qr-codes');await page.getByRole('heading',{name:'QR-koder',exact:true}).waitFor();for(const name of ['Opret QR-kode','Download PNG','Download SVG','Eksportér CSV'])assert.equal(await page.getByRole('button',{name,exact:true,includeHidden:true}).count(),0);checks.push('actual viewer browser has no mutation or export controls');
    phase='browser_analytics';await page.getByRole('button',{name:'Statistik',exact:true}).click();await page.getByRole('combobox',{name:'QR-kode',exact:true}).selectOption(created.id);await page.getByRole('button',{name:'Vis statistik',exact:true}).click();await page.getByText('Registrerede åbninger',{exact:true}).waitFor();const metric=page.locator('dl > div').filter({has:page.locator('dt').filter({hasText:/^Registrerede åbninger$/})}).locator('dd');assert.equal(await metric.textContent(),'2');assert.equal(await page.getByRole('button',{name:'Eksportér CSV',exact:true,includeHidden:true}).count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);checks.push('actual mobile viewer statistics match native events with no CSV or page overflow');
   }finally{await limited.close();}
   assert.equal(browserErrors,0,'QR_QA0_BROWSER_ERRORS');
  }finally{await browser.close();}
 }
 phase='pause';const latest=(await savedRef.get()).data();const pause=await api(managerCookie,{action:'status',brandId:ids.brand,locationId:ids.location,id:created.id,status:'paused',revision:String(latest.revision),requestId:randomUUID()});assert.equal(pause.status,200);
 const paused=await fetch(BASE+qrPath,{redirect:'manual',headers:{'user-agent':MOBILE}});assert.equal(paused.status,404);assert.equal((await savedRef.collection('qrScanEvents').get()).size,2);checks.push('paused redirect rejects without adding scan events');
 return {environment:'QR-QA0-local',project:'demo-orderfly-qa0',checks,browserAcceptance:!apiOnly,browserErrors,blockedExternalRequests:blockedExternal,productionAcceptance:false,physicalScanVerified:false};
}).then(result=>console.log(JSON.stringify(result))).catch(()=>{console.error('QR_QA0_SMOKE_FAILED_PHASE_'+phase);process.exitCode=1;});
