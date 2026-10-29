const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),zlib=require('node:zlib');
const {chromium}=require('@playwright/test');
const payload=JSON.parse(zlib.gunzipSync(Buffer.concat([0,1,2].map(i=>fs.readFileSync(`preview/esmeralda/payload.json.gz.part-00${i}`)))));
const type=path=>/\.js$/.test(path)?'application/javascript':/\.css$/.test(path)?'text/css':/\.svg$/.test(path)?'image/svg+xml':/\.avif$/.test(path)?'image/avif':/\.webp$/.test(path)?'image/webp':'text/html';
test('mobile hero stays in its materialized order and manual next works; menu cookie form does not request CAPTCHA',{timeout:45000},async()=>{
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url()),entry=payload[u.pathname];return u.origin==='https://www.esmeraldapizza.dk'&&entry?route.fulfill({status:200,contentType:type(u.pathname),body:Buffer.from(entry.data,'base64')}):route.abort();});
  await page.goto('https://www.esmeraldapizza.dk/');
  await page.locator('[flowappz-cookie-command="reject-all"]').click();
  await page.waitForFunction(()=>Boolean(document.querySelector('.swiper-container')?.swiper));
  assert.equal(await page.locator('.section_home-hero .swiper-wrapper > :first-child').getAttribute('id'),'pizza-club');
  assert.equal(await page.locator('#pizza-club .es-club-hero__art').getAttribute('loading'),'eager');
  await page.waitForTimeout(3500);
  assert.equal(await page.evaluate(()=>document.querySelector('.swiper-container').swiper.activeIndex),0);
  await page.locator('.swiper-button-next').click();
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(()=>document.querySelector('.swiper-container').swiper.activeIndex),1);
  assert.match(await page.locator('.section_home-hero .swiper-wrapper > :nth-child(2)').textContent(),/Weekends.*brunch hos Esmeralda/s);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth),false);
  await page.goto('https://www.esmeraldapizza.dk/pages/menukort');
  await page.waitForTimeout(1000);
  assert.equal(await page.locator('.flowappz-cookie-settings-form-wrapper[data-turnstile-sitekey]').count(),0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
