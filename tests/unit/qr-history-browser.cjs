const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),ts=require('typescript');
const {chromium}=require('@playwright/test');let server,browser,origin;
const row={id:'audit1',at:Date.parse('2026-10-21T22:30:00Z'),action:'update',actorId:'staff-1',revision:2,previousRevision:1,changes:[{field:'name',before:'Menu',after:'Poster'}]};
const codes=[{id:'q1',name:'Bord 1'},{id:'q2',name:'Bord 2 '+ 'Langt navn '.repeat(30)}];
before(async()=>{
 const component=ts.transpileModule(fs.readFileSync('src/app/superadmin/qr-codes/qr-history.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const react=path.dirname(require.resolve('react/package.json')),dom=path.dirname(require.resolve('react-dom/package.json'));
 const boot=`const root=ReactDOM.createRoot(document.getElementById('root'));window.__codes=${JSON.stringify(codes)};const load=async id=>{const response=await fetch('/history/'+id);const body=await response.json();if(!response.ok)throw body;return body};const draw=()=>root.render(React.createElement(module.exports.QrHistory,{codes:window.__codes,load}));window.__clear=()=>{window.__codes=[];draw()};draw();`;
 server=http.createServer((req,res)=>{
  if(req.url==='/react.js'){res.setHeader('content-type','application/javascript; charset=utf-8');return res.end(fs.readFileSync(path.join(react,'umd/react.development.js')))}
  if(req.url==='/dom.js'){res.setHeader('content-type','application/javascript; charset=utf-8');return res.end(fs.readFileSync(path.join(dom,'umd/react-dom.development.js')))}
  if(req.url==='/component.js'){res.setHeader('content-type','application/javascript; charset=utf-8');return res.end('window.module={exports:{}};window.exports=module.exports;window.require=name=>{if(name!=="react")throw Error(name);return React};\n'+component+'\n'+boot)}
  res.setHeader('content-type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><main id="root" style="max-width:100%;min-width:0"></main><script src="/react.js"></script><script src="/dom.js"></script><script src="/component.js"></script></body></html>');
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CART_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function open({width=390,answer}={}){const page=await browser.newPage({viewport:{width,height:900}}),calls=[];page.setDefaultTimeout(5000);
 await page.route('**/history/*',async route=>{const id=route.request().url().split('/').pop();calls.push(id);if(answer)return answer(route,id);return route.fulfill({json:{rows:[row],truncated:false,discarded:0}})});
 await page.goto(origin);await page.getByRole('heading',{name:'Ændringshistorik',exact:true}).waitFor();return{page,calls};}
for(const width of [390,1440])test(`explicit code selection loads scoped history and Danish time at ${width}px`,async()=>{const{page,calls}=await open({width});try{
 assert.deepEqual(calls,[]);await page.getByLabel('QR-kode til historik',{exact:true}).selectOption('q1');
 await page.getByRole('heading',{name:'Redigeret · revision 2',exact:true}).waitFor();assert.deepEqual(calls,['q1']);
 assert.equal(await page.locator('time').getAttribute('datetime'),'2026-10-21T22:30:00.000Z');assert.match(await page.locator('time').innerText(),/22\.10\.2026/);
 assert.match(await page.getByRole('list',{name:'Historikposter'}).innerText(),/Før: Menu\nEfter: Poster/);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
}finally{await page.close()}});
test('truncation, discarded rows and legacy unknown details remain visible without invented changes',async()=>{const{page}=await open({answer:route=>route.fulfill({json:{rows:[{...row,changes:undefined},{...row,id:'audit2',revision:3,previousRevision:2,changes:[]}],truncated:true,discarded:1}})});try{
 await page.getByLabel('QR-kode til historik').selectOption('q1');await page.getByRole('heading',{name:'Redigeret · revision 3'}).waitFor();
 assert.equal(await page.getByRole('listitem').count(),2);assert.equal(await page.getByRole('status').count(),2);
 await page.getByText('Detaljer er ukendte eller ligger uden for din adgang.',{exact:true}).waitFor();await page.getByText('Ingen ændringer i de viste detaljefelter.',{exact:true}).waitFor();
}finally{await page.close()}});
test('denial hides prior rows, preserves selection and never renders raw exception details',async()=>{let attempts=0;const{page}=await open({answer:route=>++attempts===1?route.fulfill({json:{rows:[row],truncated:false,discarded:0}}):route.fulfill({status:403,json:{error:'PRIVATE_DATABASE_TRACE'}})});try{
 await page.getByLabel('QR-kode til historik').selectOption('q1');await page.getByRole('heading',{name:'Redigeret · revision 2'}).waitFor();await page.getByRole('button',{name:'Genindlæs historik'}).click();await page.getByRole('alert').waitFor();
 assert.equal(await page.getByRole('listitem').count(),0);assert.equal(await page.getByLabel('QR-kode til historik').inputValue(),'q1');assert.equal((await page.locator('body').innerText()).includes('PRIVATE_DATABASE_TRACE'),false);
}finally{await page.close()}});
test('late result from previous code cannot replace current selection and empty response',async()=>{let finish;const{page,calls}=await open({answer:async(route,id)=>{if(id==='q1'){await new Promise(resolve=>{finish=resolve});return route.fulfill({json:{rows:[row],truncated:false,discarded:0}})}return route.fulfill({json:{rows:[],truncated:false,discarded:0}})}});try{
 await page.getByLabel('QR-kode til historik').selectOption('q1');await page.getByRole('status').waitFor();
 await page.getByLabel('QR-kode til historik').selectOption('q2');await page.getByText('Ingen ændringer fundet for denne kode.',{exact:true}).waitFor();finish();
 await page.waitForResponse(response=>response.url().endsWith('/history/q1'));
 assert.equal(await page.getByRole('listitem').count(),0);assert.equal(await page.getByLabel('QR-kode til historik').inputValue(),'q2');assert.deepEqual(calls,['q1','q2']);
 await page.evaluate(()=>window.__clear());assert.equal(await page.getByLabel('QR-kode til historik').inputValue(),'');
}finally{finish?.();await page.close()}});
test('historical strings are text, including long URL and markup-like labels',async()=>{const markup='<img src=x onerror="window.__injected=1">';const{page}=await open({answer:route=>route.fulfill({json:{rows:[{...row,changes:[{field:'destination',before:markup,after:'https://example.org/'+ 'x'.repeat(1900)}]}],truncated:false,discarded:0}})});try{
 await page.getByLabel('QR-kode til historik').selectOption('q2');await page.getByRole('heading',{name:'Redigeret · revision 2'}).waitFor();
 assert.equal(await page.locator('img').count(),0);assert.equal(await page.evaluate(()=>window.__injected),undefined);assert.ok((await page.getByRole('listitem').innerText()).includes(markup));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
}finally{await page.close()}});
