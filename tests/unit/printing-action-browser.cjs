const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');

test('dedicated printer action pages use explicit revisioned edits/deactivate/delete; navigation and errors never mutate',async t=>{
 const {chromium,expect}=require('@playwright/test'),webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
 const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'printer-action-'));let browser,server;
 t.after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
 const entry=path.join(dir,'entry.js'),loader=path.join(dir,'loader.js'),navigation=path.join(dir,'navigation.js'),link=path.join(dir,'link.js');
 fs.writeFileSync(entry,`import React from'react';import{createRoot}from'react-dom/client';import{PrinterActionPage}from ${JSON.stringify(path.join(root,'src/app/superadmin/printers/printer-action-page.tsx'))};const query=new URLSearchParams(location.search),action=query.get('action')||'edit',state=query.get('state')||(action==='edit'?'disabled':'active');window.navigation=[];createRoot(document.getElementById('root')).render(React.createElement(PrinterActionPage,{action,brandName:'Esmeralda',locationName:'Amager',item:{revision:5,configuration:{id:'Esm-02',brandId:'b',locationId:'l',name:'Køkken',description:'',manufacturer:'star',model:'mc-print3',transport:'cloudprnt-http',state,paperWidthMm:80}}}));`);
 fs.writeFileSync(navigation,`export const useRouter=()=>({push:path=>window.navigation.push(path)});`);
 fs.writeFileSync(link,`import React from'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children);}`);
 fs.writeFileSync(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'@':path.join(root,'src'),'next/navigation':navigation,'next/link':link},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=(await require('postcss')([require('tailwindcss')(path.join(root,'tailwind.config.ts'))]).process(fs.readFileSync(path.join(root,'src/app/globals.css'),'utf8'),{from:path.join(root,'src/app/globals.css')})).css;
 server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}if(req.url==='/style.css'){res.setHeader('content-type','text/css');return res.end(css);}res.setHeader('content-type','text/html;charset=utf-8');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body style="padding:16px"><div id="root"></div><script src="/bundle.js"></script></body></html>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:375,height:812}}),calls=[],errors=[];let mode='normal',pending;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route(/\/api\/merchant\/printers(?:\/lifecycle)?$/,async route=>{
  const req=route.request(),body=req.postDataJSON();calls.push({method:req.method(),url:new URL(req.url()).pathname,body});
  if(mode==='hold'){pending=route;return;}
  if(mode==='conflict')return route.fulfill({status:409,json:{error:'record_conflict'}});
  if(mode==='unauthorized')return route.fulfill({status:401,json:{error:'unauthorized'}});
  if(mode==='unknown')return route.fulfill({status:200,json:{item:{revision:999}}});
  return route.fulfill({json:body.action==='delete'?{deleted:true,printerId:body.printerId,revision:body.revision+1}:{item:{revision:body.revision+1,configuration:body.configuration||{id:'Esm-02',brandId:'b',locationId:'l',name:'Køkken',description:'',manufacturer:'star',model:'mc-print3',transport:'cloudprnt-http',state:'disabled',paperWidthMm:80}}}});
 });
 for(const width of [375,1280]){
  await page.setViewportSize({width,height:900});const before=calls.length;
  await page.goto(origin+'/?action=edit&state=active');await expect(page.getByRole('heading',{name:'Rediger printer',exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Gå til deaktivering'})).toHaveAttribute('href','/superadmin/printers/b/l/Esm-02/deactivate');
  await expect(page.getByRole('button',{name:'Gem deaktiveret printer'})).toHaveCount(0);assert.equal(calls.length,before);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)<=1);
 }
 await page.goto(origin+'/?action=edit');await page.getByRole('textbox',{name:'Printernavn',exact:true}).fill('Nyt køkken');
 assert.equal(calls.length,0);await page.getByRole('button',{name:'Gem deaktiveret printer'}).click();await expect(page.getByRole('status')).toHaveText('Printeropsætningen er gemt.');
 assert.equal(calls.length,1);assert.equal(calls[0].method,'PATCH');assert.equal(calls[0].body.revision,5);assert.equal(calls[0].body.configuration.name,'Nyt køkken');assert.equal(calls[0].body.configuration.state,'disabled');
 await page.goto(origin+'/?action=deactivate');await expect(page.getByRole('dialog')).toHaveCount(0);const count=calls.length;
 mode='hold';await page.getByRole('button',{name:'Deaktiver printer',exact:true}).click();await expect(page.getByRole('button',{name:'Tilbage til printeroversigten'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'Gemmer…'})).toBeDisabled();await expect.poll(()=>calls.length).toBe(count+1);
 assert.deepEqual(calls.at(-1).body,{brandId:'b',locationId:'l',printerId:'Esm-02',revision:5,action:'deactivate'});
 await pending.fulfill({json:{item:{revision:6,configuration:{id:'Esm-02',brandId:'b',locationId:'l',name:'Køkken',description:'',manufacturer:'star',model:'mc-print3',transport:'cloudprnt-http',state:'disabled',paperWidthMm:80}}}});
 await expect(page.getByRole('status')).toHaveText('Printeren er deaktiveret.');await expect(page.getByText('Køkken · Esm-02 · Aktiv',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Rediger printer'})).toHaveAttribute('href','/superadmin/printers/b/l/Esm-02/edit');
 mode='normal';await page.goto(origin+'/?action=delete');const beforeDelete=calls.length;await expect(page.getByText('Printeren fjernes fra oversigten. Historik og tidligere printjobs bevares.')).toBeVisible();assert.equal(calls.length,beforeDelete);
 await page.getByRole('button',{name:'Slet printer',exact:true}).click();await expect(page.getByRole('status')).toContainText('Historikken er bevaret.');assert.equal(calls.at(-1).body.action,'delete');assert.equal(calls.at(-1).method,'POST');
 for(const errorMode of ['conflict','unknown']){
  mode=errorMode;await page.goto(origin+'/?action=delete');await page.getByRole('button',{name:'Slet printer',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'Slet printer',exact:true})).toBeDisabled();await expect(page.getByRole('status')).toHaveCount(0);
 }
 mode='unauthorized';await page.goto(origin+'/?action=edit');await page.getByRole('button',{name:'Gem deaktiveret printer'}).click();await expect(page.getByRole('alert')).toHaveText('Din session er udløbet. Log ind igen.');await expect(page.getByRole('form')).toHaveCount(0);
 const beforeBack=calls.length;await page.getByRole('button',{name:'Tilbage til printeroversigten'}).click();assert.deepEqual(await page.evaluate(()=>window.navigation),['/superadmin/printers']);assert.equal(calls.length,beforeBack);
 mode='normal';await page.goto(origin+'/?action=deactivate&state=disabled');await expect(page.getByText('Printeren er allerede deaktiveret.')).toBeVisible();await expect(page.getByRole('button',{name:'Deaktiver printer',exact:true})).toHaveCount(0);assert.equal(calls.length,beforeBack);
 assert.deepEqual(errors,[]);await page.close();
});
