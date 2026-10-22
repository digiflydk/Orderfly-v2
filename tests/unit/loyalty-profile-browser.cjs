const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{chromium}=require('@playwright/test');
const webpack=require('next/dist/compiled/webpack/webpack');webpack.init();
let dir,server,browser,origin;
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'loyalty-profile-'));
 const write=(name,value)=>{const file=path.join(dir,name);fs.writeFileSync(file,value);return file;};
 const src=rel=>JSON.stringify(path.join(process.cwd(),'src',rel));
 const navigation=write('navigation.js',`export const useRouter=()=>({refresh(){window.__refresh=(window.__refresh||0)+1}});`);
 const entry=write('entry.js',`import React from 'react';import{createRoot}from'react-dom/client';
 import{ProfileSettings}from ${src('app/[brandSlug]/club/profil/profile-settings')};
 import{PortalFrame}from ${src('app/[brandSlug]/club/portal-frame')};
 import{portalPreset}from ${src('app/[brandSlug]/club/brand-preset')};
 createRoot(document.getElementById('root')).render(React.createElement(PortalFrame,{slug:'esmeralda',base:'/club',preset:portalPreset({slug:'esmeralda',name:'Esmeralda'}),brandName:'Esmeralda',signedIn:true,program:{name:'Esmeralda Club',active:true,stampsRequired:8,rewardDescription:'Gratis pizza'}},
 React.createElement(ProfileSettings,{slug:'esmeralda',base:'/club',programName:'Esmeralda Club',member:{name:'Anna',email:'anna@example.com'},profile:window.__profile,newsletter:{subscribed:true,consentVersion:'v1',consentText:'Ja tak til nyhedsbrevet',consentHelp:''}})));`);
 const loader=write('loader.js',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},
 resolve:{alias:{'next/navigation':navigation,'@':path.join(process.cwd(),'src'),'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client')},extensions:['.tsx','.ts','.js'],modules:[path.join(process.cwd(),'node_modules'),'node_modules']},
 module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/loyalty-profile-.*[\\/](entry|navigation)\.js$/,use:[loader]}]},
 }).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 execFileSync(path.join(process.cwd(),'node_modules/.bin/tailwindcss'),['-c','tailwind.config.ts','-i','src/app/globals.css','-o',path.join(dir,'styles.css'),'--minify'],{stdio:'pipe'});
 const styles=fs.readFileSync(path.join(dir,'styles.css'),'utf8')+'\n'+fs.readFileSync('src/styles/commerce-ui.css','utf8')+'\n'+fs.readFileSync('src/app/[brandSlug]/club/esmeralda-club.css','utf8');
 server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return res.end(styles);}res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div data-commerce-root data-brand-slug="esmeralda"><div id="root"></div></div><script src="/bundle.js"></script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function open({width=390,profile={phone:'',birthDate:null,gender:null},answer}={}){
 const page=await browser.newPage({viewport:{width,height:900}}),calls=[];
 await page.addInitScript(value=>{window.__profile=value},profile);
 await page.route('**/api/loyalty/esmeralda/*',async route=>{
  const body=route.request().postDataJSON(),name=new URL(route.request().url()).pathname.split('/').pop();calls.push({name,body});
  if(answer==='abort')return route.abort('internetdisconnected');
  const result=answer||[200,{profile:body}];await route.fulfill({status:result[0],contentType:'application/json',body:JSON.stringify(result[1])});
 });
 await page.goto(origin);return{page,calls};
}
const noOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);
for(const width of [320,390,1440])test(`profile saves optional details through the existing session API at ${width}px`,async()=>{
 const{page,calls}=await open({width});try{
  await page.getByLabel('Telefonnummer',{exact:true}).fill('+45 55556666');
  await page.getByLabel('Fødselsdato',{exact:true}).fill('1990-05-01');
  await page.getByLabel('Køn',{exact:true}).selectOption('prefer_not_to_say');
  await page.getByRole('button',{name:'Gem oplysninger',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Dine oplysninger er gemt.'}).waitFor();
  assert.deepEqual(calls,[{name:'profile',body:{phone:'+45 55556666',birthDate:'1990-05-01',gender:'prefer_not_to_say'}}]);
  assert.equal(await page.evaluate(()=>window.__refresh),1);assert.ok(await noOverflow(page));
  assert.equal(await page.getByRole('button',{name:'Afmeld nyhedsbrevet',exact:true}).count(),1);
  assert.equal(await page.getByRole('button',{name:'Slet medlemskab',exact:true}).count(),1);
 }finally{await page.close();}
});
test('profile renders persisted values, rejects invalid/future input without sending and can clear optional details',async()=>{
 const{page,calls}=await open({profile:{phone:'+4511112222',birthDate:'1990-05-01',gender:'female'}}); try{
  assert.equal(await page.getByLabel('Telefonnummer',{exact:true}).getAttribute('value'),'+4511112222');
  await page.getByLabel('Telefonnummer',{exact:true}).fill('bad');await page.getByRole('button',{name:'Gem oplysninger',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'Skriv et gyldigt telefonnummer'}).waitFor();assert.equal(calls.length,0);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'club-profile-phone');
  await page.getByLabel('Telefonnummer',{exact:true}).fill('');await page.getByLabel('Fødselsdato',{exact:true}).fill('2999-01-01');
  await page.getByRole('button',{name:'Gem oplysninger',exact:true}).click();await page.getByRole('alert').filter({hasText:'ikke ligger i fremtiden'}).waitFor();assert.equal(calls.length,0);
  await page.getByLabel('Fødselsdato',{exact:true}).fill('');await page.getByLabel('Køn',{exact:true}).selectOption('');
  await page.getByRole('button',{name:'Gem oplysninger',exact:true}).click();await page.getByText('Dine oplysninger er gemt.').waitFor();
  assert.deepEqual(calls[0].body,{phone:'',birthDate:null,gender:null});
 }finally{await page.close();}
});
for(const answer of ['abort',[409,{error:'customer_conflict'}]])test(`profile explains ${typeof answer==='string'?'network failure':'identity conflict'} and keeps edits`,async()=>{
 const{page}=await open({answer});try{
  await page.getByLabel('Telefonnummer',{exact:true}).fill('+4555556666');await page.getByRole('button',{name:'Gem oplysninger',exact:true}).click();
  await page.getByRole('alert').filter({hasText:typeof answer==='string'?'Ingen forbindelse':'Telefonnummeret kan ikke gemmes'}).waitFor();
  assert.equal(await page.getByLabel('Telefonnummer',{exact:true}).getAttribute('value'),'+4555556666');
  assert.equal(await page.getByRole('button',{name:'Gem oplysninger',exact:true}).isEnabled(),true);
 }finally{await page.close();}
});
test('expired profile session returns to login',async()=>{
 const{page}=await open({answer:[401,{error:'unauthorized'}]});try{
  await page.getByRole('button',{name:'Gem oplysninger',exact:true}).click();await page.waitForURL(origin+'/club/login');
 }finally{await page.close();}
});
