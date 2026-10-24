const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {execFileSync}=require('node:child_process'),{chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin;
const discount={id:'personal',discountType:'percentage',discountValue:15,description:'Velkommen i Club',minOrderValue:100,allowStacking:false,
  endsAt:Date.parse('2026-12-01T22:59:00Z'),locationIds:['private-location-id'],orderTypes:['pickup'],activeDays:['monday','friday'],activeTimeSlots:[{start:'16:00',end:'20:00'}]};
const campaigns={welcomeStamps:1,profile:{stamps:1,requiredFields:['phone','birthDate','gender']},discount};
const member={program:{name:'Esmeralda Club',active:true,rewardDescription:'Gratis pizza',terms:'Vilkår'},member:{name:'Anna Hansen',email:'anna@example.com',joinedAt:1},
  card:{stamps:2,stampsRequired:8,expiresAt:null,rewardDescription:'Gratis pizza'},rewards:[],history:[],newsletter:{subscribed:true,consentVersion:'c'}};
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'discount-card-browser-'));
 const write=(name,code)=>{const f=path.join(dir,name);fs.writeFileSync(f,code);return f;};
 const src=p=>JSON.stringify(path.join(root,'src',p));
 const navigation=write('navigation.js',`export const useRouter=()=>({refresh(){}});export const usePathname=()=>'/club';`);
 const entry=write('entry.js',`
 import React from 'react';import {createRoot} from 'react-dom/client';
 import {SignupBenefits,MemberBenefits,ProfileBonusHint} from ${src('app/[brandSlug]/club/club-benefits')};
 import {SignupForm} from ${src('app/[brandSlug]/club/tilmeld/signup-form')};
 import {MemberCard} from ${src('app/[brandSlug]/club/member-card')};
 import {PortalFrame,EsmeraldaClubFooter} from ${src('app/[brandSlug]/club/portal-frame')};
 import {portalPreset} from ${src('app/[brandSlug]/club/brand-preset')};
 const cfg=window.__config||{},view=location.pathname.slice(1),offer=cfg.campaigns;
 function SignupFixture(){const [shownOffer,setShownOffer]=React.useState(offer);return React.createElement(React.Fragment,null,
  React.createElement(SignupForm,{slug:'esmeralda',base:'/club',program:{name:'Esmeralda Club',consentText:'Ja tak til nyhedsbrevet',consentHelp:'',termsAccept:'Jeg accepterer vilkårene.',consentVersion:'c',termsVersion:'t',campaigns:shownOffer}}),
  cfg.nextCampaigns&&React.createElement('button',{onClick:()=>setShownOffer(cfg.nextCampaigns)},'Opdater kampagne'));}
 const node=view==='signup'?React.createElement(SignupFixture)
  :view==='member'?React.createElement(MemberCard,{slug:'esmeralda',base:cfg.base||'/club',member:{...${JSON.stringify(member)},campaigns:offer,discountCard:cfg.discountCard}})
  :view==='hint'?React.createElement(ProfileBonusHint,{campaign:offer?.profile,claimed:cfg.claimed,profileHref:'/club/profil'})
  :view==='earned'?React.createElement(MemberBenefits,{campaigns:offer,base:cfg.base||'/club'})
  :React.createElement(SignupBenefits,{campaigns:offer});
 createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,
  React.createElement(PortalFrame,{slug:'esmeralda',base:'/club',preset:portalPreset({slug:'esmeralda',name:'Esmeralda'}),brandName:'Esmeralda',signedIn:['member','earned','hint'].includes(view),
    program:{name:'Esmeralda Club',active:true,stampsRequired:8,rewardDescription:'Pizza'}},node),React.createElement(EsmeraldaClubFooter,{onOpenCookieSettings(){}})));`);
 const loader=write('loader.js',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'next/navigation':navigation,'@':path.join(root,'src'),
  'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},
  module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/discount-card-browser-.*[\\/](entry|navigation)\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 execFileSync(path.join(root,'node_modules/.bin/tailwindcss'),['-c','tailwind.config.ts','-i','src/app/globals.css','-o',path.join(dir,'styles.css'),'--minify'],{cwd:root,stdio:'pipe'});
 const css=fs.readFileSync(path.join(dir,'styles.css'),'utf8')+fs.readFileSync('src/styles/commerce-ui.css','utf8')+fs.readFileSync('src/app/[brandSlug]/club/esmeralda-club.css','utf8');
 server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return res.end(css);}res.setHeader('content-type','text/html;charset=utf-8');res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div data-commerce-root data-brand-slug="esmeralda"><div id="root"></div></div><script src="/bundle.js"></script></body></html>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function open(view,config={},width=390){const page=await browser.newPage({viewport:{width,height:900}});const calls=[];page.setDefaultTimeout(5000);page.on("pageerror",e=>console.error("PAGEERROR",e.message));
 await page.addInitScript(value=>window.__config=value,config);
 await page.route('**/api/loyalty/**',route=>{calls.push(route.request().url());return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'unavailable'})});});
 await page.goto(origin+'/'+view);return {page,calls};}
const noOverflow=p=>p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);


const personal={groupName:'Familie og venner',percentage:20,status:'active',startsAt:null,expiresAt:null,locations:{all:true,names:[]},showStampCard:true};
for(const width of [390,1440])test(`personal card and old stamps remain visible at ${width}px`,async()=>{
 const {page}=await open('member',{discountCard:personal},width);
 try{
 const card=page.getByRole('region',{name:'Dit personlige rabatkort'});await card.waitFor();
 assert.ok((await card.innerText()).includes('20 % rabat'));
 assert.equal(await card.getByRole('link',{name:'Bestil med dit rabatkort'}).getAttribute('href'),'/');
 await page.getByRole('img',{name:'2 af 8 stempler'}).waitFor();
 assert.ok(await noOverflow(page));
 }finally{await page.close();}
});
test('all inactive states hide buy action and discount-only members do not get an empty stamp grid',async()=>{
 for(const status of ['pending','blocked','inactive','upcoming','expired']){
 const {page}=await open('member',{discountCard:{...personal,status,showStampCard:false}});
 try{const card=page.getByRole('region',{name:'Dit personlige rabatkort'});await card.waitFor();assert.equal(await card.getByRole('link').count(),0);assert.equal(await page.locator('[data-stamps]').count(),0);}finally{await page.close();}
 }
});
test('selected locations and date are visible, group markup escaped and prefixed shop link correct',async()=>{
 const name='<img src=x onerror=alert(1)>';
 const {page}=await open('member',{base:'/esmeralda/club',discountCard:{...personal,groupName:name,percentage:12.5,locations:{all:false,names:['Amager','Centrum']},expiresAt:Date.parse('2027-01-01T12:00:00Z')}});
 try{const card=page.getByRole('region',{name:'Dit personlige rabatkort'});await card.waitFor();assert.ok((await card.innerText()).includes('12,5 %'));await card.getByText(name,{exact:true}).waitFor();assert.equal(await card.locator('img').count(),0);await card.getByText('Gælder hos: Amager, Centrum.').waitFor();assert.equal(await card.getByRole('link').getAttribute('href'),'/esmeralda');assert.ok(await noOverflow(page));}finally{await page.close();}
});
test('ordinary member without assignment retains standard card and no discount message',async()=>{
 const {page}=await open('member');try{await page.locator('[data-stamps]').waitFor();assert.equal(await page.getByRole('region',{name:'Dit personlige rabatkort'}).count(),0);}finally{await page.close();}
});
test('shared membership QR shows server token only and does not authorize or claim a discount',async()=>{
 const {page,calls}=await open('member',{discountCard:personal});
 try{
 await page.route('**/api/loyalty/esmeralda/qr',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,token:'a'.repeat(64),expiresAt:Date.now()+60000,serverTime:Date.now()})}));
 await page.getByRole('button',{name:'Prøv igen'}).click();
 await page.locator('[data-qr-valid-until]').waitFor();
 await page.getByText('Koden identificerer dit Club-medlemskab og skifter automatisk. Kortrabatten beregnes i Orderfly, når du er logget ind.').waitFor();
 assert.ok(calls.every(url=>url.endsWith('/qr')));
 }finally{await page.close();}
});
