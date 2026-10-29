const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const {chromium}=require('@playwright/test');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)))));
const type=p=>/\.js$/.test(p)?'application/javascript':/\.css$/.test(p)?'text/css':/\.svg$/.test(p)?'image/svg+xml':/\.woff2?$/.test(p)?'font/woff2':/\.avif$/.test(p)?'image/avif':/\.webp$/.test(p)?'image/webp':'text/html';
for(const width of [390,1440])test(`menu categories support keyboard, pointer and reset without CAPTCHA at${width}px`,{timeout:30000},async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),unexpected=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',route=>{
   const request=route.request(),u=new URL(request.url()),entry=payload[u.pathname];
   if(request.method()!=='GET'||u.origin!=='https://www.esmeraldapizza.dk'){unexpected.push(request.method()+' '+u.origin+u.pathname);return route.abort();}
   return route.fulfill(entry?{status:200,contentType:type(u.pathname),body:Buffer.from(entry.data,'base64')}:{status:404,body:''});
  });
  await page.goto('https://www.esmeraldapizza.dk/menu');await page.locator('[flowappz-cookie-command="reject-all"]').click();
  const form=page.locator('#wf-form-Dish-category'),all=form.getByRole('button',{name:'all',exact:true}),pizza=form.getByRole('radio',{name:'Pizza',exact:true}),pasta=form.getByRole('radio',{name:'Pasta',exact:true});
  assert.equal(await form.getAttribute('data-turnstile-sitekey'),null);assert.equal(await form.getByRole('radio').count(),11);
  const list=page.locator('[fs-cmsfilter-element="list"] .w-dyn-item');assert.equal(await list.count(),75);
  const catalogue=await list.locator('[fs-cmsfilter-field="dish"]').allTextContents();
  const expected=async(category)=>{
   const count=category?catalogue.filter(value=>value.trim()===category).length:75;
   await page.waitForFunction(({category,count})=>{
    const list=document.querySelector('[fs-cmsfilter-element="list"]');
    // Finsweet swaps its DOM before its Web Animations fade-in finishes.
    // Require the actual rendered list to settle before the next user action.
    if(Number(getComputedStyle(list).opacity)<0.99||list.getAnimations().some(a=>a.playState==='running'))return false;
    const items=[...document.querySelectorAll('[fs-cmsfilter-element="list"] .w-dyn-item')];
    const visible=items.filter(e=>{const r=e.getBoundingClientRect();return getComputedStyle(e).visibility!=='hidden'&&r.width>0&&r.height>0;});
    return visible.length===count&&visible.every(e=>!category||e.querySelector('[fs-cmsfilter-field="dish"]').textContent.trim()===category);
   },{category,count});
   const visible=list.filter({visible:true});
   if(category==='Pizza')assert.equal(await visible.count(),19);
   else if(category==='Pasta')assert.equal(await visible.count(),9);
   else if(!category)assert.equal(await visible.count(),75);
  };
  await expected(null);
  await all.focus();await page.keyboard.press('Tab');assert.equal(await pizza.evaluate(e=>e===document.activeElement),true);
  assert.equal(await pizza.evaluate(e=>getComputedStyle(e.closest('label')).outlineWidth),'2px');
  await page.keyboard.press('Space');assert.equal(await pizza.isChecked(),true);await expected('Pizza');
  await page.keyboard.press('ArrowRight');assert.equal(await pasta.evaluate(e=>e===document.activeElement),true);assert.equal(await pasta.isChecked(),true);await expected('Pasta');
  await all.focus();await page.keyboard.press('Space');await expected(null);assert.equal(await form.locator('input[type="radio"]:checked').count(),0);
  await pasta.locator('..').click();await expected('Pasta');
  await all.focus();await page.keyboard.press('Enter');await expected(null);
  assert.equal(page.url(),'https://www.esmeraldapizza.dk/menu');assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
