'use strict';
const assert = require('node:assert/strict');
const {chromium, expect} = require('@playwright/test');
const {withDeliveryFixture} = require('./delivery-fixture.cjs');
const apiOnly = process.argv.includes('--api-only');
let phase = 'seed';
require('./delivery-fixture-safety.cjs')().then(()=>withDeliveryFixture(async ({db,ids,merchantId,manager,viewer,superuser,session,BASE}) => {
  const checks = ['existing root and orphan-child collision preserve native sentinels'], cookie = await session(manager), viewerCookie = await session(viewer);
  const url = (brand=ids.brand,location=null) => BASE+'/api/delivery/settings?brandId='+brand+(location?'&locationId='+location:'');
  const read = (auth,brand=ids.brand,location=null) => fetch(url(brand,location),{headers:{cookie:auth}});
  const write = (auth,body,origin=BASE) => fetch(BASE+'/api/delivery/settings',{method:'PUT',headers:{cookie:auth,origin,'content-type':'application/json'},body:JSON.stringify(body)});
  phase='native_settings';
  assert.equal((await read('')).status,401);
  assert.equal((await read(cookie,ids.foreignBrand)).status,403);
  assert.equal((await read(cookie,ids.brand,ids.foreignLocation)).status,403);
  const response=await read(cookie); assert.equal(response.status,200); const initial=await response.json();
  assert.equal(initial.settings.enabled,false);assert.equal(initial.revision,0);
  const command={scope:'brand',brandId:ids.brand,locationId:null,expectedRevision:0,settings:{...initial.settings,preparationMinutes:25}};
  assert.equal((await write(viewerCookie,command)).status,403);
  assert.equal((await write(cookie,command,'https://foreign.example')).status,403);
  assert.equal((await write(cookie,command)).status,200);
  assert.equal((await db.doc('deliverySettings/'+ids.brand).get()).data().settings.preparationMinutes,25);
  assert.equal((await write(cookie,command)).status,409);
  assert.equal((await db.collection('deliverySettings/'+ids.brand+'/audit').get()).size,1);
  checks.push('native authenticated settings persist once; anonymous, foreign scope, viewer write, cross-origin and stale revision rejected');
  phase='native_orders';
  const orders=BASE+'/api/delivery/orders?brandId='+ids.brand+'&locationId='+ids.location;
  assert.equal((await fetch(orders,{headers:{cookie}})).status,200);
  assert.equal((await fetch(orders.replace(ids.location,ids.foreignLocation),{headers:{cookie}})).status,403);
  checks.push('native operational list loads and rejects foreign location');
  phase='native_portal';
  const superCookie=await session(superuser),portal=BASE+'/api/delivery/merchants';
  const portalRequest=(path='',method='GET',body,auth=superCookie,origin=BASE)=>fetch(portal+path,{method,headers:{cookie:auth,origin,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await portalRequest('', 'GET',undefined,'')).status,401);
  assert.equal((await portalRequest('', 'GET',undefined,cookie)).status,403);
  const metadata={displayName:'QA0 Native Merchant',merchantId:'qa0-merchant',venueId:'qa0-venue',pickupContact:{name:'QA0 Pickup',phone:'+4512345678',verifiedAt:'2026-10-26T00:00:00Z'}};
  const create={...metadata,brandId:ids.brand,locationId:ids.location,environment:'sandbox'};
  assert.equal((await portalRequest('', 'POST',create,superCookie,'https://foreign.example')).status,403);
  const created=await portalRequest('', 'POST',create);assert.ok([200,201].includes(created.status));
  let merchant=(await created.json()).merchant;assert.equal(merchant.id,merchantId);assert.equal(merchant.status,'draft');
  for(const field of ['secretRefs','callbackKey','operation'])assert.equal(Object.hasOwn(merchant,field),false);
  assert.deepEqual(merchant.credentials,{apiConfigured:false,webhookConfigured:false});
  assert.equal((await portalRequest('', 'POST',create)).status,409);
  assert.equal((await portalRequest('/'+merchantId+'/actions','POST',{action:'activate',expectedRevision:merchant.revision})).status,409);
  const edited=await portalRequest('/'+merchantId,'PUT',{...metadata,displayName:'QA0 Native Merchant Edited',expectedRevision:merchant.revision});assert.equal(edited.status,200);merchant=(await edited.json()).merchant;
  assert.equal((await portalRequest('/'+merchantId,'PUT',{...metadata,expectedRevision:1})).status,409);
  const deactivated=await portalRequest('/'+merchantId+'/actions','POST',{action:'deactivate',expectedRevision:merchant.revision});assert.equal(deactivated.status,200);merchant=(await deactivated.json()).merchant;assert.equal(merchant.status,'inactive');
  checks.push('native portal draft create and edit persist; scoped manager, cross-origin, duplicate, stale revision and unready activation denied; secret fields absent');
  let browserErrors=0,blockedExternal=0;
  if(!apiOnly){
    phase='browser_launch';
    const browser=await chromium.launch({executablePath:process.env.CART_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-component-update','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1']});
    try {
      async function context(width,height){
        const c=await browser.newContext({serviceWorkers:'block',viewport:{width,height}});
        await c.route('**/*',route=>{const u=new URL(route.request().url());return u.hostname==='127.0.0.1'&&['3100','9099','8088'].includes(u.port)?route.continue():(blockedExternal++,route.abort('blockedbyclient'));});
        await c.routeWebSocket('**/*',ws=>{const u=new URL(ws.url());if(u.hostname==='127.0.0.1'&&u.port==='3100')ws.connectToServer();else{blockedExternal++;ws.close();}});
        return c;
      }
      async function login(c,user){
        const page=await c.newPage();page.on('pageerror',()=>browserErrors++);
        await page.goto(BASE+'/admin-login',{waitUntil:'networkidle'});
        await page.getByRole('button',{name:'Log ind med en separat Orderfly-konto',exact:true}).click();
        await page.getByRole('button',{name:'Log ind med Opsfly',exact:true}).waitFor();
        await page.getByLabel('E-mail',{exact:true}).fill(user.email);await page.getByLabel('Adgangskode',{exact:true}).fill(user.password);
        const response=page.waitForResponse(r=>r.url()===BASE+'/api/admin/session'&&r.request().method()==='POST');
        await page.getByRole('button',{name:'LOG IND',exact:true}).click();assert.equal((await response).status(),200);
        await page.waitForURL(u=>!u.pathname.startsWith('/admin-login'));return page;
      }
      let preparation=25;
      for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
        phase='browser_'+width;const c=await context(width,height);
        try{
          const page=await login(c,manager);assert.equal((await page.goto(BASE+'/merchant/delivery')).status(),200);
          const brand=page.getByRole('combobox',{name:'Brand',exact:true});await brand.selectOption(ids.brand);
          await expect(page.getByText('Kundevendt levering: Ikke aktiveret')).toBeVisible();
          assert.equal(await brand.locator('option[value="'+ids.foreignBrand+'"]').count(),0);
          const tab=page.getByRole('button',{name:'Indstillinger',exact:true});await tab.focus();await expect(tab).toBeFocused();await page.keyboard.press('Enter');
          const field=page.getByRole('spinbutton',{name:/Klargøringstid/});await field.fill(String(++preparation));
          const save=page.getByRole('button',{name:'Gem indstillinger',exact:true});await save.focus();await expect(save).toBeFocused();await page.keyboard.press('Enter');
          await expect(page.getByRole('status')).toContainText('Indstillingerne er gemt');
          assert.equal((await db.doc('deliverySettings/'+ids.brand).get()).data().settings.preparationMinutes,preparation);
          await page.reload();await brand.selectOption(ids.brand);await tab.click();await expect(field).toHaveValue(String(preparation));
          await page.getByRole('combobox',{name:'Restaurant',exact:true}).selectOption(ids.location);
          await expect(page.getByText('Arvet fra brand').first()).toBeVisible();
          await page.getByRole('button',{name:'Leveringer',exact:true}).click();
          await expect(page.getByText('Ingen leveringer fundet i den gennemgåede liste.')).toBeVisible();
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
          checks.push('real Next/Auth/Firestore save reload inheritance and keyboard activation at '+width+'x'+height);
        }finally{await c.close();}
      }
      phase='browser_viewer';const c=await context(390,844);
      try{const page=await login(c,viewer);await page.goto(BASE+'/merchant/delivery');await page.getByRole('combobox',{name:'Brand',exact:true}).selectOption(ids.brand);await page.getByRole('button',{name:'Indstillinger',exact:true}).click();await expect(page.getByRole('spinbutton',{name:/Klargøringstid/})).toBeDisabled();checks.push('native viewer browser controls remain read-only');}finally{await c.close();}
      for(const [width,height] of [[390,844],[768,1024],[1024,768],[1440,900]]){
        phase='portal_browser_'+width;const c=await context(width,height);
        try{const page=await login(c,superuser);await page.goto(BASE+'/superadmin/delivery');
          await expect(page.getByRole('rowheader',{name:'QA0 Native Merchant Edited',exact:true})).toBeVisible();
          const edit=page.getByRole('link',{name:'Rediger QA0 Native Merchant Edited',exact:true});await edit.focus();await expect(edit).toBeFocused();await page.keyboard.press('Enter');
          await expect(page.getByLabel('Visningsnavn',{exact:true})).toHaveValue('QA0 Native Merchant Edited');
          await expect(page.getByLabel(/API-nøgle/)).toHaveValue('');await expect(page.getByLabel(/Webhook-signaturhemmelighed/)).toHaveValue('');
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
          checks.push('native enrolled merchant overview/detail and empty secret controls at '+width+'x'+height);
        }finally{await c.close();}
      }
      assert.equal(browserErrors,0,'DELIVERY_QA0_BROWSER_ERRORS');
    }finally{await browser.close();}
  }
  phase='native_portal_archive';
  const beforeArchive=(await db.doc('deliveryMerchantEnrollments/'+merchantId).get()).data();
  const archived=await portalRequest('/'+merchantId+'/actions','POST',{action:'delete',expectedRevision:beforeArchive.revision});assert.equal(archived.status,200);
  assert.equal((await db.doc('deliveryMerchantEnrollments/'+merchantId).get()).data().status,'archived');
  assert.ok((await db.collection('deliveryMerchantEnrollments/'+merchantId+'/audit').get()).size>=4);
  assert.equal((await (await portalRequest()).json()).merchants.length,0);
  assert.equal((await portalRequest('/'+merchantId)).status,200);
  checks.push('native archive hides overview row and preserves enrollment/audit history');
  return {environment:'DELIVERY-QA0-local',project:'demo-orderfly-qa0',checks,browserAcceptance:!apiOnly,browserErrors,blockedExternalRequests:blockedExternal,externalProviderAcceptance:false,checkoutAcceptance:false,productionAcceptance:false,physicalPrintVerified:false};
})).then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error('DELIVERY_QA0_SMOKE_FAILED_PHASE_'+phase);process.exitCode=1;});
