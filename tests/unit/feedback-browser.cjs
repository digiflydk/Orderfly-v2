const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const {fixture}=require('../helpers/feedback-fixture.cjs');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin,f;
function file(name,code){const target=path.join(dir,name+'.js');fs.writeFileSync(target,code);return target;}
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'feedback-browser-'));
 const entry=file('entry',`import React from'react';import{createRoot}from'react-dom/client';
 import QuestionForm from ${JSON.stringify(path.join(root,'src/components/superadmin/feedback-question-version-form.tsx'))};
 import QuestionList from ${JSON.stringify(path.join(root,'src/app/superadmin/feedback/questions/client-page.tsx'))};
 import {FeedbackFormClient} from ${JSON.stringify(path.join(root,'src/app/feedback/form-client.tsx'))};
 import {FeedbackClientPage} from ${JSON.stringify(path.join(root,'src/app/superadmin/feedback/client-page.tsx'))};
 const route=location.pathname;fetch('/data?path='+encodeURIComponent(route)).then(r=>r.json()).then(data=>createRoot(document.getElementById('root')).render(route==='/public'?<FeedbackFormClient {...data}/>:route.endsWith('/new')||route.includes('/edit/')?<QuestionForm {...data}/>:route==='/inbox'?<FeedbackClientPage {...data}/>:<QuestionList initialVersions={data}/>));`);
 const loader=file('ts-loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 const actions=file('actions',`const send=async(kind,data)=>{const response=await fetch('/action/'+kind,{method:'POST',body:data instanceof FormData?data:JSON.stringify(data),headers:data instanceof FormData?{}:{'content-type':'application/json'}});if(!response.ok)throw Error('Transport failed');const result=await response.json();if(result.redirect){location.assign(result.redirect);return;}return result;};
 export const createOrUpdateQuestionVersion=data=>send('version',data);export const submitFeedbackAction=(_,data)=>send('public',data);export const updateFeedback=(id,data)=>send('update',{id,data});export const deleteFeedback=id=>send('delete',{id});`);
 const aliases={
  '@/app/superadmin/feedback/actions':actions,
  '@/app/superadmin/locations/actions':file('locations',`export const getAllLocations=()=>{throw Error('Unexpected post-mount server action');};`),
  '@/hooks/use-toast':file('toast','const toast=()=>{};export const useToast=()=>({toast});'),
  'next/navigation':file('navigation',`const router={push:href=>location.assign(href),refresh:()=>location.reload()};export const useRouter=()=>router;`),
  'next/image':file('image',`import React from'react';export default function Image({fill,priority,...props}){return <img {...props}/>;}`),
  'next/link':file('link',`import React from'react';export const useLinkStatus=()=>({pending:false});export default function Link(props){return <a {...props}/>;}`),
  'react$':require.resolve('next/dist/compiled/react'),
  'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),
  'react-dom$':require.resolve('next/dist/compiled/react-dom'),
  'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client'),
  '@':path.join(root,'src'),
 };
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},
  plugins:[new webpackModule.webpack.NormalModuleReplacementPlugin(/^\.\/actions$/,resource=>{if(resource.context===path.join(root,'src/app/superadmin/feedback')||resource.context===path.join(root,'src/app/feedback'))resource.request=actions;})],
  resolve:{alias:aliases,extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]},{test:/feedback-browser-.*\.js$/,use:[loader]}]}}).run((err,stats)=>err?reject(err):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 f=fixture();
 server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/bundle.js'){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  if(url.pathname==='/data'){
   const pathname=url.searchParams.get('path');let data;
   if(pathname==='/public')data={context:{sourceType:'commerce_order',sourceId:'order',customerId:'c',locationId:'l',brandId:'b',brandName:'Esmeralda QA',experienceType:'pickup',displayReference:'QA order'},questionsVersion:await f.store.readQuestionVersion('v1')};
   else if(pathname==='/inbox')data={initialFeedback:(await f.admin.getFeedbackEntries()).map(row=>({...row,customerName:'QA Guest',brandName:'Esmeralda QA',locationName:'Amager',questionVersionLabel:'Besøg'})),brands:[{id:'b',name:'Esmeralda QA'}],locations:[{id:'l',name:'Amager',brandId:'b'}]};
   else if(pathname.endsWith('/new')||pathname.includes('/edit/'))data={mode:pathname.endsWith('/new')?'create':'edit',version:pathname.endsWith('/new')?undefined:await f.store.readQuestionVersion(pathname.split('/').pop()),supportedLanguages:[{code:'da',name:'Dansk'},{code:'en',name:'English'}]};
   else data=await f.admin.getFeedbackQuestionVersions();
   res.setHeader('content-type','application/json');return res.end(JSON.stringify(data));
  }
  if(url.pathname.startsWith('/action/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
   const data=req.headers['content-type'].includes('application/json')?JSON.parse(body):await new Request('http://local/action',{method:'POST',headers:{'content-type':req.headers['content-type']},body}).formData();
   let result;try{const kind=url.pathname.split('/').pop();result=kind==='public'?await f.public.submitFeedbackAction(null,data):kind==='version'?await f.admin.createOrUpdateQuestionVersion(data):kind==='update'?await f.admin.updateFeedback(data.id,data.data):await f.admin.deleteFeedback(data.id);}catch(error){if(error.digest==='NEXT_REDIRECT')result={redirect:error.url};else throw error;}
   res.setHeader('content-type','application/json');return res.end(JSON.stringify(result));
  }
  res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function setup(t,pathname,width=390){
 f=fixture();const context=await browser.newContext({viewport:{width,height:900}});t.after(()=>context.close());
 const page=await context.newPage();page.setDefaultTimeout(7000);const errors=[];page.on('pageerror',e=>errors.push(e.message));t.after(()=>assert.deepEqual(errors,[]));
 await page.goto(origin+pathname);return page;
}
test('create version, reopen, edit, list canonical name and retain draft on transport failure',async t=>{
 const page=await setup(t,'/superadmin/feedback/questions/new',1280);
 await page.getByLabel('Version Label',{exact:true}).fill('QA feedback');await page.getByRole('button',{name:'Add Question',exact:true}).click();await page.getByLabel('Question label',{exact:true}).fill('Hvordan var maden?');
 await page.route('**/action/version',route=>route.fulfill({status:503,body:'Unavailable'}));await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByRole('alert').filter({hasText:'Dine ændringer er bevaret'}).waitFor();
 assert.equal(await page.getByLabel('Version Label',{exact:true}).inputValue(),'QA feedback');await page.unroute('**/action/version');
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForURL('**/edit/*');await page.getByLabel('Question label',{exact:true}).waitFor();assert.equal(await page.getByLabel('Question label',{exact:true}).inputValue(),'Hvordan var maden?');
 await page.getByLabel('Version Label',{exact:true}).fill('QA updated');await page.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[role="alert"]'));await page.getByLabel('Version Label',{exact:true}).waitFor();
 await page.goto(origin+'/superadmin/feedback/questions');await page.getByText('QA updated',{exact:true}).waitFor();await page.getByText('Besøg',{exact:true}).waitFor();assert.equal(await page.getByText('stale-id',{exact:true}).count(),0);
});
for(const width of [390,1280])test(`required answer, retry after transport error and successful feedback (${width})`,async t=>{
 const page=await setup(t,'/public',width);await page.getByRole('button',{name:'Send feedback',exact:true}).click();await page.getByRole('alert').filter({hasText:'Required feedback question is missing'}).waitFor();
 await page.getByRole('button',{name:'4 stars',exact:true}).click();await page.getByPlaceholder('Your feedback...').fill('God oplevelse');
 await page.route('**/action/public',route=>route.fulfill({status:503,body:'Unavailable'}));await page.getByRole('button',{name:'Send feedback',exact:true}).click();await page.getByRole('alert').filter({hasText:'Dine svar er bevaret'}).waitFor();
 assert.equal(await page.getByPlaceholder('Your feedback...').inputValue(),'God oplevelse');assert.equal(await page.getByRole('button',{name:'4 stars',exact:true}).getAttribute('aria-pressed'),'true');await page.unroute('**/action/public');
 await page.getByRole('button',{name:'Send feedback',exact:true}).click();await page.waitForURL('**/feedback/thank-you');
 const entries=await f.admin.getFeedbackEntries();assert.equal(entries.length,1);assert.equal(entries[0].rating,4);assert.equal(entries[0].comment,'God oplevelse');
});
test('inbox renders missing dates and rolls back moderation on lost network response',async t=>{
 const page=await setup(t,'/inbox',1280);f.records.set('feedback/f',{rating:4,brandId:'b',locationId:'l',customerId:'c',showPublicly:false});await page.reload();await page.getByText('Dato mangler').waitFor();
 await page.route('**/action/update',route=>route.fulfill({status:503,body:'Unavailable'}));await page.getByRole('switch',{name:'Show publicly'}).check();await page.getByRole('alert').filter({hasText:'Kunne ikke gemme'}).waitFor();assert.equal(await page.getByRole('switch',{name:'Show publicly'}).isChecked(),false);
 await page.unroute('**/action/update');await page.getByRole('switch',{name:'Show publicly'}).check();await page.waitForFunction(()=>!document.querySelector('[role="switch"]').disabled);assert.equal(f.records.get('feedback/f').showPublicly,true);
});
