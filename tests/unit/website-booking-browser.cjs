const {test}=require('node:test'),assert=require('node:assert/strict');
const {chromium,expect}=require('@playwright/test');
const {loadTs}=require('../helpers/load-ts.cjs');
const server=loadTs('src/lib/web-design-preview-server.ts');
const FLOW='esmeralda_booking_flow_v3',vip='vip_room_kr_ver_minimum_6_personers_booking';
const result={ok:true,found:true,booking_id:'synthetic-booking',booking_reference:'SYNTHETIC-904',starts_at:'2026-12-01T17:00:00Z',party_size:6,status:'confirmed',is_test:true};
for(const width of [390,1440])test(`booking URLs, VIP and uncertain recovery at ${width}px`,{timeout:60000},async()=>{
 process.env.ESMERALDA_PUBLIC_ENABLED='true';
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 try{
  const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage();
  const confirmations=[],errors=[];let recorded=false;
  page.on('pageerror',error=>errors.push(error.message));
  // Every network request is intercepted. This test never creates a live reservation.
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.href==='https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/booking-api'){
    const body=req.postDataJSON();let data;
    if(body.action==='fields')data={system_fields:[],fields:[{id:'33333333-3333-4333-8333-333333333333',field_type:'checkbox',label:'Room preference',is_required:false,options:[{option_value:vip,option_label:'VIP',min_party_size:6,requires_staff_confirmation:true}]}]};
    else if(body.action==='availability')data={slots:[{starts_at:body.date+'T17:00:00Z',local_time:'18:00',duration_minutes:120}]};
    else if(body.action==='recover')data=recorded?result:{found:false};
    else if(body.action==='confirm'){
     confirmations.push({body,key:req.headers()['x-idempotency-key']});recorded=true;
     return route.fulfill({status:503,json:{error:'Synthetic lost response'}});
    }else return route.abort();
    return route.fulfill({status:200,json:data});
   }
   if(url.origin!=='https://www.esmeraldapizza.dk'||req.method()!=='GET')return route.abort();
   const response=await server.webDesignPreviewResponse(new Request(req.url(),{headers:{host:url.host,'x-forwarded-proto':'https'}}));
   return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
  });
  await page.goto('https://www.esmeraldapizza.dk/bordbooking?utm_campaign=synthetic-904');
  await page.locator('[flowappz-cookie-command="reject-all"]').click();
  await page.locator('#eb-party').selectOption('2');
  await page.locator('[data-booking-time]').first().click();
  await expect(page).toHaveURL(/\/bordbooking\/informationer\?utm_campaign=synthetic-904$/);
  await expect(page.locator(`input[value="${vip}"]`)).toBeDisabled();
  await page.locator('#eb-back').click();
  await page.locator('#eb-party').selectOption('6');
  await page.locator('[data-booking-time]').first().click();
  await expect(page.locator(`input[value="${vip}"]`)).toBeEnabled();
  await page.locator(`input[value="${vip}"]`).check();
  await page.locator('#eb-back').click();
  await page.locator('#eb-party').selectOption('2');
  await page.locator('[data-booking-time]').first().click();
  await expect(page.locator(`input[value="${vip}"]`)).not.toBeChecked();
  await expect(page.locator(`input[value="${vip}"]`)).toBeDisabled();
  await page.locator('#eb-back').click();
  await page.locator('#eb-party').selectOption('6');
  await page.locator('[data-booking-time]').first().click();
  await page.locator(`input[value="${vip}"]`).check();
  await page.locator('#eb-name').fill('Synthetic Guest');await page.locator('#eb-phone').fill('00000000');
  await page.locator('#eb-email').fill('synthetic@example.invalid');
  await page.reload();
  await expect(page.locator('#eb-name')).toHaveValue('Synthetic Guest');
  await expect(page.locator(`input[value="${vip}"]`)).toBeChecked();
  await page.locator('#eb-confirm').click();
  await expect(page.locator('#eb-name')).toBeDisabled();
  assert.equal(confirmations.length,1);
  const savedKey=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)).key,FLOW);
  assert.equal(confirmations[0].key,savedKey);
  await page.reload();
  await expect(page).toHaveURL(/\/bordbooking\/bekr%C3%A6ftelse\?utm_campaign=synthetic-904$/);
  await expect(page.locator('#eb-success-step')).toBeVisible();
  await expect(page.locator('.esmeralda-mobile-cta')).toHaveCount(0);
  assert.equal(confirmations.length,1);
  await page.goBack();await expect(page.locator('#eb-success-step')).toBeVisible();
  await page.reload();await expect(page.locator('#eb-success-step')).toBeVisible();
  const complete=await page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),FLOW);
  assert.equal(complete.payload,null);assert.equal(complete.values,null);assert.equal(confirmations.length,1);
  const newTab=await context.newPage();
  await newTab.goto('https://www.esmeraldapizza.dk/bordbooking/Bekr%C3%A6ftelse');
  await expect(newTab).toHaveURL('https://www.esmeraldapizza.dk/bordbooking');
  await expect(newTab.locator('#eb-success-step')).toBeHidden();
  assert.deepEqual(errors,[]);
 }finally{await browser.close();delete process.env.ESMERALDA_PUBLIC_ENABLED;}
});
