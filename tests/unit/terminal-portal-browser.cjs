// Actual portal/login/terminal React with real HTTPS HttpOnly cookies; synthetic services only.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),https=require('node:https');
const {execFileSync}=require('node:child_process'),{chromium,expect}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
let dir,browser,server,origin,state;const root=process.cwd(),cookie='__Host-orderfly_terminal';
const session={authenticated:true,brandId:'brand-a',brandName:'Esmeralda',locationId:'loc-a',locationName:'Amager'};
const newState=()=>({valid:new Set(),loginCalls:0,renewCalls:0,logoutCalls:0,merchantCalls:0,paymentCalls:0,printCalls:0,sessionStatus:200,logoutStatus:200,badScope:false,paid:false});
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'terminal-portal-'));
 const write=(name,body)=>{const file=path.join(dir,name);fs.writeFileSync(file,body);return file;};
 const navigation=write('navigation.js',`const router={replace:url=>location.assign(url),refresh:()=>window.dispatchEvent(new Event('focus'))};export const useRouter=()=>router;`);
 const actions=write('actions.js',`export async function registerPickupPayment(){throw Error('Dedicated portal must not use merchant action');}`);
 const entry=write('entry.js',`import React from'react';import{createRoot}from'react-dom/client';import{TerminalLogin}from${JSON.stringify(path.join(root,'src/app/terminal/login/terminal-login'))};import{TerminalPortal}from${JSON.stringify(path.join(root,'src/app/terminal/orders/terminal-portal'))};createRoot(document.getElementById('root')).render(React.createElement(location.pathname==='/terminal/login'?TerminalLogin:TerminalPortal));`);
 const loader=write('loader.js',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'next/navigation':navigation,[path.join(root,'src/app/merchant/orders/actions.ts')]:actions,'@/app/merchant/orders/actions':actions,'@':path.join(root,'src')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 execFileSync(path.join(root,'node_modules/.bin/tailwindcss'),['-c',path.join(root,'tailwind.config.ts'),'-i',path.join(root,'src/app/globals.css'),'-o',path.join(dir,'styles.css'),'--minify'],{stdio:'pipe'});
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem'),'-days','1','-subj','/CN=localhost'],{stdio:'pipe'});
 const token=req=>(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookie+'='))?.slice(cookie.length+1);
 const setCookie=(res,value,maxAge=400*86400)=>res.setHeader('set-cookie',`${cookie}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
 server=https.createServer({key:fs.readFileSync(path.join(dir,'key.pem')),cert:fs.readFileSync(path.join(dir,'cert.pem'))},async(req,res)=>{
  const url=new URL(req.url,'https://localhost');const reply=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  if(url.pathname==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/styles.css'){res.setHeader('content-type','text/css');return res.end(fs.readFileSync(path.join(dir,'styles.css')));}
  if(url.pathname.startsWith('/api/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const command=chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};
   if(url.pathname.startsWith('/api/merchant/')){state.merchantCalls++;return reply(500,{error:'wrong_endpoint'});}
   const saved=token(req);
   if(url.pathname==='/api/terminal/auth/login'){state.loginCalls++;if(command.username!=='amager'||command.password!=='fixture-password')return reply(401,{error:'unauthorized'});const id='fixture-'+state.loginCalls;state.valid.add(id);setCookie(res,id);return reply(200,session);}
   if(url.pathname==='/api/terminal/auth/logout'){state.logoutCalls++;if(state.logoutStatus!==200)return reply(state.logoutStatus,{error:'unavailable'});state.valid.delete(saved);setCookie(res,'',0);return reply(200,{success:true});}
   if(url.pathname==='/api/terminal/auth/session'){state.renewCalls++;if(state.sessionStatus!==200)return reply(state.sessionStatus,{error:'unavailable'});if(!state.valid.has(saved))return reply(401,{error:'unauthorized'});if(state.holdRenewal){state.heldRenewal=()=>{setCookie(res,saved);reply(200,session);};return;}setCookie(res,saved);return reply(200,session);}
   if(!state.valid.has(saved))return reply(401,{error:'unauthorized'});
   if(url.pathname==='/api/terminal/orders/payment'){state.paymentCalls++;state.paid=true;return reply(200,{success:true,changed:true,message:'Betalingen er registreret.'});}
   if(url.pathname==='/api/terminal/orders/status')return reply(200,{success:true,changed:true});
   if(url.pathname==='/api/terminal/orders/reprint'){state.printCalls++;return reply(200,{items:[],nextCursor:null});}
   if(url.pathname==='/api/terminal/orders'){
    if(url.searchParams.get('brandId')!=='brand-a'||url.searchParams.get('locationId')!=='loc-a'){state.badScope=true;return reply(403,{error:'forbidden'});}
    const order={id:'ORD-PORTAL',brandId:'brand-a',locationId:'loc-a',brandName:'Esmeralda',locationName:'Amager',customerName:'Syntetisk kunde',customerContact:'',customerPhone:'',deliveryAddress:'',notes:'Ingen løg',createdAt:'2026-10-25T17:00:00Z',fulfillmentAt:'2026-10-25T18:00:00Z',deliveryTime:'19:00',deliveryType:'Pickup',status:'Ready',paymentStatus:state.paid?'Paid':'Pending',paymentMethod:'PayAtPickup',totalAmount:149,refundedAmountOre:0,items:[{name:'Pizza',quantity:1,unitPrice:149,totalPrice:149,modifiers:[]}]};
    return reply(200,{orders:[order],locations:[{brandId:'brand-a',brandName:'Esmeralda',locationId:'loc-a',locationName:'Amager'}],selectedBrandId:'brand-a',selectedLocationId:'loc-a',canEdit:true,serverTime:'2026-10-25T17:00:00Z',nextCursor:null,hasMore:false});
   }
   return reply(404,{error:'not_found'});
  }
  res.setHeader('content-type','text/html;charset=utf-8');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main class="p-4"><div id="root"></div></main><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='https://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function context(t,storageState){const c=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:768,height:1024},...(storageState?{storageState}:{})});t.after(()=>c.close());return c;}
async function login(page){await page.goto(origin+'/terminal/login');await page.getByLabel('Brugernavn',{exact:true}).fill('amager');await page.getByLabel('Adgangskode',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Log ind',exact:true}).click();await expect(page.getByRole('button',{name:'Åbn ordre ORD-PORTAL'})).toBeVisible();}

test('failed login is generic; successful portal has dedicated scope and no admin navigation',async t=>{
 state=newState();const c=await context(t),page=await c.newPage();await page.goto(origin+'/terminal/login');
 if(process.env.TERMINAL_PORTAL_SCREENSHOTS){fs.mkdirSync(process.env.TERMINAL_PORTAL_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.TERMINAL_PORTAL_SCREENSHOTS,'terminal-login.png'),fullPage:true});}
 await page.getByLabel('Brugernavn',{exact:true}).fill('amager');await page.getByLabel('Adgangskode',{exact:true}).fill('wrong-password');await page.getByRole('button',{name:'Log ind',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Login kunne ikke bekræftes');assert.equal((await c.cookies()).length,0);await expect(page.getByLabel('Adgangskode',{exact:true})).toHaveValue('');
 await page.getByLabel('Adgangskode',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'Log ind',exact:true}).click();await expect(page.getByRole('button',{name:'Åbn ordre ORD-PORTAL'})).toBeVisible();
 assert.equal(await page.locator('a[href^="/merchant"],a[href^="/superadmin"],a[href^="/admin-login"]').count(),0);assert.equal(await page.getByRole('combobox',{name:'Restaurant',exact:true}).count(),0);assert.equal(state.badScope,false);assert.equal(state.merchantCalls,0);
 if(process.env.TERMINAL_PORTAL_SCREENSHOTS)await page.screenshot({path:path.join(process.env.TERMINAL_PORTAL_SCREENSHOTS,'terminal-orders.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).length),0);assert.equal(await page.evaluate(()=>document.cookie.includes('__Host-orderfly_terminal')),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
});
test('persistent HTTPS HttpOnly cookie survives context restart and renews on focus',async t=>{
 state=newState();const first=await context(t),page=await first.newPage();await login(page);
 const stored=await first.storageState();const saved=stored.cookies.find(x=>x.name===cookie);assert.ok(saved);assert.equal(saved.httpOnly,true);assert.equal(saved.secure,true);assert.equal(saved.sameSite,'Lax');assert.ok(saved.expires>Date.now()/1000+300*86400);
 saved.expires=Date.now()/1000+180*86400;const second=await context(t,stored),next=await second.newPage();const logins=state.loginCalls;await next.goto(origin+'/terminal/orders');await expect(next.getByRole('button',{name:'Åbn ordre ORD-PORTAL'})).toBeVisible();assert.equal(state.loginCalls,logins);
 const before=state.renewCalls;await next.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>state.renewCalls).toBeGreaterThan(before);const renewed=(await second.cookies()).find(x=>x.name===cookie);assert.ok(renewed.expires>Date.now()/1000+399*86400);
});
test('transient renewal masks cached orders without logging out; revocation redirects safely',async t=>{
 state=newState();const c=await context(t),page=await c.newPage();await login(page);
 state.sessionStatus=503;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('alert').first()).toContainText('Du er ikke logget ud');await expect(page.getByRole('button',{name:'Åbn ordre ORD-PORTAL'})).toHaveCount(0);assert.equal(state.logoutCalls,0);assert.ok((await c.cookies()).some(x=>x.name===cookie));
 state.sessionStatus=200;await page.getByRole('button',{name:'Prøv igen',exact:true}).click();await expect(page.getByRole('button',{name:'Åbn ordre ORD-PORTAL'})).toBeVisible();
 state.valid.clear();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('heading',{name:'Log ind på ordreterminalen'})).toBeVisible();await expect(page.getByText('Syntetisk kunde',{exact:true})).toHaveCount(0);
});
test('uncertain logout hides orders and pauses renewal until confirmed revocation',async t=>{
 state=newState();const c=await context(t),page=await c.newPage();await login(page);state.logoutStatus=503;
 await page.getByRole('button',{name:'Log ud',exact:true}).click();await expect(page.getByRole('alert')).toContainText('Log ud kunne ikke bekræftes');assert.ok((await c.cookies()).some(x=>x.name===cookie));await expect(page.getByRole('button',{name:'Åbn ordre ORD-PORTAL'})).toHaveCount(0);
 const before=state.renewCalls;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.waitForTimeout(50);assert.equal(state.renewCalls,before);
 state.logoutStatus=200;await page.getByRole('button',{name:'Prøv Log ud igen'}).click();await expect(page.getByRole('heading',{name:'Log ind på ordreterminalen'})).toBeVisible();assert.equal((await c.cookies()).filter(x=>x.name===cookie).length,0);assert.equal(state.valid.size,0);
 await page.goto(origin+'/terminal/orders');await expect(page.getByRole('heading',{name:'Log ind på ordreterminalen'})).toBeVisible();
});
test('dedicated detail payment and reprint reads never call merchant endpoints or actions',async t=>{
 state=newState();const c=await context(t),page=await c.newPage();await login(page);await page.getByRole('button',{name:'Åbn ordre ORD-PORTAL'}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect.poll(()=>state.printCalls).toBeGreaterThan(0);
 await dialog.getByRole('button',{name:'Registrér betaling'}).click();assert.equal(state.paymentCalls,0);await dialog.getByRole('button',{name:'Bekræft betaling modtaget'}).click();await expect.poll(()=>state.paymentCalls).toBe(1);await expect(dialog.getByRole('button',{name:'Markér afhentet'})).toBeEnabled();assert.equal(state.merchantCalls,0);
});

test('logout wins over an already pending session renewal response',async t=>{
 state=newState();const c=await context(t),page=await c.newPage();await login(page);
 state.holdRenewal=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(()=>!!state.heldRenewal).toBe(true);
 await page.getByRole('button',{name:'Log ud',exact:true}).click();await expect(page.getByRole('heading',{name:'Log ind på ordreterminalen'})).toBeVisible();
 state.holdRenewal=false;state.heldRenewal();assert.equal(state.valid.size,0);
 await page.goto(origin+'/terminal/orders');await expect(page.getByRole('heading',{name:'Log ind på ordreterminalen'})).toBeVisible();await expect(page.getByText('Syntetisk kunde',{exact:true})).toHaveCount(0);
});
