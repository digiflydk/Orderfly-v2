const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const {chromium}=require('@playwright/test');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)))));
const type=p=>/\.js$/.test(p)?'application/javascript':/\.css$/.test(p)?'text/css':/\.svg$/.test(p)?'image/svg+xml':/\.woff2?$/.test(p)?'font/woff2':/\.avif$/.test(p)?'image/avif':/\.webp$/.test(p)?'image/webp':'text/html';
for(const width of [390,1440])test(`footer booking accessible name and keyboard public navigation at${width}px`,{timeout:30000},async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),unexpected=[],blockedBookingReads=[];
  await context.route('**/*',route=>{
   const request=route.request(),u=new URL(request.url()),entry=payload[u.pathname];
   // The unmodified destination starts read-only fields/availability POSTs.
   // Deny them locally, and fail on confirmation/tracking/any other action.
   if(u.href==='https://bdemvarwpfcxyczunchx.supabase.co/functions/v1/booking-api'&&request.method()==='POST'){
    const action=request.postDataJSON()?.action;
    if(['fields','availability'].includes(action)){blockedBookingReads.push(action);return route.abort();}
   }
   if(request.method()!=='GET'||u.origin!=='https://www.esmeraldapizza.dk'){unexpected.push(request.method()+' '+u.origin+u.pathname);return route.abort();}
   return route.fulfill(entry?{status:200,contentType:type(u.pathname),body:Buffer.from(entry.data,'base64')}:{status:404,body:''});
  });
  await page.goto('https://www.esmeraldapizza.dk/');
  await page.locator('[flowappz-cookie-command="reject-all"]').click();
  if(width===390){
   const summary=page.locator('.es-header-v2__summary');await summary.focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator('.es-header-v2__mobile-menu').evaluate(e=>e.open),true);
   await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Menukort');
   await summary.focus();await page.keyboard.press('Space');assert.equal(await page.locator('.es-header-v2__mobile-menu').evaluate(e=>e.open),false);
  }
  for(const path of ['/','/pages/menukort']){
   if(path!=='/')await page.goto('https://www.esmeraldapizza.dk'+path);
   const booking=page.locator('.footer_link[href="/bordbooking"]');
   assert.equal(await booking.and(page.getByRole('link',{name:'Book bord',exact:true})).count(),1);
   assert.equal(await booking.and(page.getByRole('link',{name:'Kontakt os',exact:true})).count(),0);
   assert.equal(await page.locator('.footer_link[href="/kontakt"]').getAttribute('aria-label'),'Kontakt os');
  }
  await page.locator('.footer_link[href="/bordbooking"]').focus();
  await Promise.all([page.waitForURL('https://www.esmeraldapizza.dk/bordbooking'),page.keyboard.press('Enter')]);
  assert.equal(await page.getByRole('heading',{name:'Book bord hos Esmeralda',exact:true}).count(),1);
  assert.ok(blockedBookingReads.includes('fields'));assert.ok(blockedBookingReads.includes('availability'));
  assert.deepEqual(unexpected,[]);
 }finally{await browser.close();}
});
