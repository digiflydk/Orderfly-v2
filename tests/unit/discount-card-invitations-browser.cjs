// Actual notification card, real browser and compiled CSS. Server action is synthetic.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
let dir,browser,server,origin;const root=process.cwd();
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'club-notifications-'));
 const write=(name,body)=>{const file=path.join(dir,name);fs.writeFileSync(file,body);return file;};
 const actions=write('actions.js',`
 export async function portalRequest(slug,path,body){window.__calls=(window.__calls||[]).concat([{slug,path,body}]);
 const q=new URLSearchParams(location.search);
 if(q.has('error'))return {ok:false,error:'link_invalid'};
 if(path.endsWith('/accept'))return {ok:true,data:{ok:true}};
 return {ok:true,data:{groupName:'Familie',percentage:20,terms:'Personligt kort. Ingen marketing.',termsVersion:'discount-card-terms-v1',locationScope:{mode:'selected',locationIds:['location']},locations:[{id:'location',name:'Amager'}],startsAt:null,expiresAt:null}};
 }`);
 const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';
 import{DiscountInvitationFlow}from ${JSON.stringify(path.join(root,'src/app/[brandSlug]/club/invitation/invitation-flow'))};
 createRoot(document.getElementById('root')).render(React.createElement(DiscountInvitationFlow,{slug:'brand',base:'/accepted'}));`);
 const loader=write('loader.js',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'../portal-api$':actions,'@':path.join(root,'src'),'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/club-notifications-.*[\\/](entry|actions)\.js$/,use:[loader]}]}}).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 execFileSync(path.join(root,'node_modules/.bin/tailwindcss'),['-c',path.join(root,'tailwind.config.ts'),'-i',path.join(root,'src/app/globals.css'),'-o',path.join(dir,'styles.css'),'--minify'],{stdio:'pipe'});
 server=http.createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return res.end(fs.readFileSync(path.join(dir,'styles.css')));}
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main class="p-4"><div id="root"></div></main><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
for(const width of [390,1440])test(`invitation strips token and requires explicit terms at ${width}px`,async()=>{
 const page=await browser.newPage({viewport:{width,height:900}});try{
  await page.goto(origin+'/#token='+'a'.repeat(64));
  const button=page.getByRole('button',{name:'Aktivér mit rabatkort'});await button.waitFor();
  assert.equal(new URL(page.url()).hash,'');assert.equal(await button.isDisabled(),true);
  assert.equal(await page.getByRole('checkbox').isChecked(),false);
  assert.equal(await page.getByText('Amager',{exact:true}).count(),1);
  assert.equal(await page.evaluate(()=>window.__calls.length),1);
  await page.getByRole('checkbox').check();await button.click();await page.waitForURL('**/accepted');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }finally{await page.close();}
});
test('preview failure displays error without acceptance action',async()=>{
 const page=await browser.newPage();try{await page.goto(origin+'/?error=1#token='+'a'.repeat(64));await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button').count(),0);assert.equal(await page.evaluate(()=>window.__calls.length),1);}finally{await page.close();}
});
test('missing token never calls server or offers acceptance',async()=>{
 const page=await browser.newPage();try{await page.goto(origin);await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.__calls?.length||0),0);assert.equal(await page.getByRole('checkbox').count(),0);}finally{await page.close();}
});
