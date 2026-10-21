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
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'club-benefits-'));
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
 const node=view==='signup'?React.createElement(SignupForm,{slug:'esmeralda',base:'/club',program:{name:'Esmeralda Club',consentText:'Ja tak til nyhedsbrevet',consentHelp:'',termsAccept:'Jeg accepterer vilkårene.',consentVersion:'c',termsVersion:'t',campaigns:offer}})
  :view==='member'?React.createElement(MemberCard,{slug:'esmeralda',base:cfg.base||'/club',member:{...${JSON.stringify(member)},campaigns:offer}})
  :view==='hint'?React.createElement(ProfileBonusHint,{campaign:offer?.profile,claimed:cfg.claimed,profileHref:'/club/profil'})
  :view==='earned'?React.createElement(MemberBenefits,{campaigns:offer,base:cfg.base||'/club'})
  :React.createElement(SignupBenefits,{campaigns:offer});
 createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,
  React.createElement(PortalFrame,{slug:'esmeralda',base:'/club',preset:portalPreset({slug:'esmeralda',name:'Esmeralda'}),brandName:'Esmeralda',signedIn:['member','earned','hint'].includes(view),
    program:{name:'Esmeralda Club',active:true,stampsRequired:8,rewardDescription:'Pizza'}},node),React.createElement(EsmeraldaClubFooter,{onOpenCookieSettings(){}})));`);
 const loader=write('loader.js',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{alias:{'next/navigation':navigation,'@':path.join(root,'src'),
  'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},
  module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/club-benefits-.*[\\/](entry|navigation)\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 execFileSync(path.join(root,'node_modules/.bin/tailwindcss'),['-c','tailwind.config.ts','-i','src/app/globals.css','-o',path.join(dir,'styles.css'),'--minify'],{cwd:root,stdio:'pipe'});
 const css=fs.readFileSync(path.join(dir,'styles.css'),'utf8')+fs.readFileSync('src/styles/commerce-ui.css','utf8')+fs.readFileSync('src/app/[brandSlug]/club/esmeralda-club.css','utf8');
 server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}if(req.url==='/styles.css'){res.setHeader('content-type','text/css');return res.end(css);}res.setHeader('content-type','text/html;charset=utf-8');res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div data-commerce-root data-brand-slug="esmeralda"><div id="root"></div></div><script src="/bundle.js"></script></body></html>');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function open(view,config={},width=390){const page=await browser.newPage({viewport:{width,height:900}});const calls=[];
 await page.addInitScript(value=>window.__config=value,config);
 await page.route('**/api/loyalty/**',route=>{calls.push(route.request().url());return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'unavailable'})});});
 await page.goto(origin+'/'+view);return {page,calls};}
const noOverflow=p=>p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);

test('missing and disabled campaigns render no benefit or empty member spacer',async()=>{
 for(const [view,offer] of [['benefits',undefined],['signup',{welcomeStamps:0,profile:null,discount:null}],['earned',{profile:null,profileBonusGranted:true,discount:null}]]){
  const {page,calls}=await open(view,{campaigns:offer});try{assert.equal(await page.locator('[aria-label="Fordele ved Club-tilmelding"], [aria-label="Din personlige Club-rabat"], [aria-label="Bonus for dine profiloplysninger"]').count(),0);assert.equal(await page.locator('.col-span-full').count(),0);assert.equal(calls.length,0);}finally{await page.close();}
 }
});
for(const width of [320,390,1440])for(const view of ['benefits','signup','member'])test(`${view} campaign copy and layout at ${width}px`,async()=>{
 const offer=view==='member'?{profile:campaigns.profile,profileBonusGranted:false,discount}:campaigns;
 const {page,calls}=await open(view,{campaigns:offer},width);try{
  const benefit=page.getByRole('region',{name:view==='member'?'Din personlige Club-rabat':'Fordele ved Club-tilmelding'});
  await benefit.waitFor();await benefit.getByText(/15 %/).waitFor();await benefit.getByText(/Mindstekøb:/).waitFor();
  await benefit.getByText(/uden anden rabat/,{exact:false}).first().waitFor();
  await benefit.getByText('Gælder afhentning.').waitFor();await benefit.getByText(/mandag, fredag/).waitFor();await benefit.getByText(/16:00–20:00/).waitFor();
  await benefit.getByText(/Gyldig indtil/).waitFor();assert.equal((await benefit.innerText()).includes('private-location-id'),false);
  if(view==='member'){
   assert.equal(await page.getByRole('link',{name:'Bestil i webshoppen'}).getAttribute('href'),'/');
   assert.equal(await page.getByRole('link',{name:'Udfyld din profil'}).getAttribute('href'),'/club/profil');
   assert.equal(await page.getByText(/Som nyt medlem/).count(),0);
  }else{await benefit.getByText(/Velkomstbonussen gives én gang/).waitFor();await benefit.getByText(/til dit næste køb/).waitFor();}
  assert.ok(await noOverflow(page));assert.ok(calls.every(url=>url.endsWith('/qr')),'viewing benefit information must not claim a bonus');
 }finally{await page.close();}
});

test('claimed profile bonus is hidden and opt-out gender is explained before claiming',async()=>{
 const {page}=await open('hint',{campaigns,claimed:false});try{await page.getByText(/Ønsker ikke at oplyse/).waitFor();await page.getByText(/telefonnummer, fødselsdato, køn/).waitFor();}finally{await page.close();}
 const done=await open('hint',{campaigns,claimed:true});try{assert.equal(await done.page.getByRole('complementary',{name:'Bonus for dine profiloplysninger'}).count(),0);}finally{await done.page.close();}
});

test('merchant text is escaped, fixed-amount and stacking terms are truthful and path-prefix shop links work',async()=>{
 const d={...discount,description:'<img src=x onerror="window.__bad=true">',discountType:'fixed_amount',discountValue:30,allowStacking:true};
 const {page}=await open('earned',{campaigns:{profile:null,profileBonusGranted:true,discount:d},base:'/esmeralda/club'},320);try{
  const benefit=page.getByRole('region',{name:'Din personlige Club-rabat'});await benefit.waitFor();
  await benefit.getByText(d.description,{exact:true}).waitFor();assert.equal(await benefit.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.__bad),undefined);
  await benefit.getByText(/30,00/).waitFor();await benefit.getByText(/inklusive tilvalg og menuer/).waitFor();
  assert.equal(await page.getByRole('link',{name:'Bestil i webshoppen'}).getAttribute('href'),'/esmeralda');assert.ok(await noOverflow(page));
 }finally{await page.close();}
});
