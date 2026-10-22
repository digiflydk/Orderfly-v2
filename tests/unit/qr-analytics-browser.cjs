// Real production client + real metric aggregation; only server/auth/transport are absent.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { chromium, expect } = require('@playwright/test');
const webpack = require('next/dist/compiled/webpack/webpack');
let dir, server, browser, origin;
const root = process.cwd();

before(async () => {
  webpack.init(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-analytics-browser-'));
  const file = (name, source) => { const target = path.join(dir, name+'.js'); fs.writeFileSync(target, source); return target; };
  const entry = file('entry', `import React from 'react';import {createRoot} from 'react-dom/client';
    import {QrAnalytics} from ${JSON.stringify(path.join(root,'src/app/superadmin/qr-codes/qr-analytics.tsx'))};
    import {aggregateQrMetrics,classifyQrRequest} from ${JSON.stringify(path.join(root,'src/lib/qr/metrics.ts'))};
    const mode=new URLSearchParams(location.search).get('mode');
    const classified=classifyQrRequest({method:'GET',userAgent:'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1',referrer:'https://example.com/path?secret=1'});
    const make=(iso,key,extra={})=>({timestamp:Date.parse(iso),qrId:'poster',classification:classified,visitorKey:key,...extra});
    const events=[make('2026-10-25T00:30:00Z','a'),make('2026-10-25T01:30:00Z','a'),make('2026-10-26T12:00:00Z',['unknown','provisional'].includes(mode)?null:'b'),make('2026-10-26T12:01:00Z',null,{classification:classifyQrRequest({method:'GET',userAgent:'Googlebot'})})];
    const metrics=aggregateQrMetrics(mode==='empty'?[]:events,{from:Date.parse('2026-10-25T00:00:00Z'),to:Date.parse('2026-10-27T00:00:00Z')});
    const codes=[{id:'poster',name:'Brunch-plakat',campaign:'Brunch',placement:'Vindue'},{id:'table',name:'Bordkort',campaign:'Club',placement:'Bord'}];
    function App(){const [calls,setCalls]=React.useState([]);const [exported,setExported]=React.useState(0);const [retries,setRetries]=React.useState(0);
      return <><QrAnalytics metrics={mode==='none'?null:metrics} codes={codes} period={{dateFrom:'2026-10-25',dateTo:'2026-10-26'}}
        futureLimited={['provisional','partial'].includes(mode)} dataAsOf={Date.parse('2026-10-26T13:00:00Z')} canExport={mode!=='denied'} complete={mode!=='partial'} loading={mode==='loading'} error={mode==='error'?'internal-secret':null}
        onFilterChange={value=>setCalls(previous=>[...previous,value])} onRetry={()=>setRetries(v=>v+1)}
        onExport={async()=>{setExported(v=>v+1);if(mode==='export-fail')throw Error('secret');if(mode==='slow-export')await new Promise(resolve=>setTimeout(resolve,250));}}/>
        <output data-testid="filter-calls">{JSON.stringify(calls)}</output><output data-testid="exports">{exported}</output><output data-testid="retries">{retries}</output></>;
    }createRoot(document.getElementById('root')).render(<App/>);`);
  const loader=file('loader',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve,reject)=>webpack.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},
    resolve:{extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules'],alias:{'@':path.join(root,'src')}},
    module:{rules:[{test:/\.[jt]sx?$/,exclude:/node_modules/,use:[loader]}]},
  }).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
  server=http.createServer((request,response)=>{
    if(request.url==='/bundle.js'){response.setHeader('content-type','application/javascript');return response.end(fs.readFileSync(path.join(dir,'bundle.js')));}
    response.setHeader('content-type','text/html');response.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px system-ui;margin:16px}*{box-sizing:border-box}table{width:100%}td,th{padding:6px}.flex{display:flex;flex-wrap:wrap}.grid{display:grid}.gap-3{gap:12px}.space-y-4>*+*{margin-top:16px}label{display:grid}input,select,button{max-width:100%;padding:8px}section{min-width:0}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
async function pageFor(t,mode='',width=1440){const context=await browser.newContext({viewport:{width,height:1000}});t.after(()=>context.close());const page=await context.newPage();page.setDefaultTimeout(6000);await page.goto(origin+'/?mode='+mode);await expect(page.getByRole('heading',{name:'QR-statistik',exact:true})).toBeVisible();return page;}
const stat=(page,label)=>page.locator('dl > div').filter({has:page.locator('dt').filter({hasText:new RegExp('^'+label+'$')})}).locator('dd');

test('shows measured totals, coarse breakdowns and safe origin without invented conversions',async t=>{
  const page=await pageFor(t);await expect(stat(page,'Registrerede åbninger')).toHaveText('4');await expect(stat(page,'Sandsynlige scanninger')).toHaveText('3');await expect(stat(page,'Estimerede unikke')).toHaveText('2');await expect(stat(page,'Udeladte åbninger')).toHaveText('1');
  await expect(page.getByRole('table',{name:'Enheder'}).getByRole('rowheader',{name:'Mobil',exact:true})).toBeVisible();
  await expect(page.getByRole('table',{name:'Henvisende websites'}).getByRole('rowheader',{name:'https://example.com',exact:true})).toBeVisible();
  assert.equal((await page.locator('body').innerText()).includes('secret=1'),false);
  await expect(page.getByRole('table',{name:'QR-koder, kampagner og placeringer'}).getByRole('rowheader',{name:'Brunch-plakat'})).toBeVisible();
  assert.equal((await page.locator('body').innerText()).includes('Omsætning'),false);
});
test('time switch preserves two autumn Danish hours and whole-period unique union',async t=>{
  const page=await pageFor(t);await page.getByRole('combobox',{name:'Tidsopdeling'}).selectOption('hour');
  const table=page.getByRole('table',{name:'Scanninger pr. time'});await expect(table.getByRole('rowheader',{name:'2026-10-25T02:00+02:00',exact:true})).toBeVisible();await expect(table.getByRole('rowheader',{name:'2026-10-25T02:00+01:00',exact:true})).toBeVisible();await expect(stat(page,'Estimerede unikke')).toHaveText('2');
  await expect(page.getByRole('img',{name:'Scanninger pr. time. Detaljer findes i tabellen nedenfor.'})).toBeVisible();
});
test('date, QR, campaign and placement filters send exact requested values',async t=>{
  const page=await pageFor(t);await page.getByLabel('Fra dato',{exact:true}).fill('2026-10-01');await page.getByLabel('Til og med dato',{exact:true}).fill('2026-10-21');await page.getByRole('combobox',{name:'QR-kode',exact:true}).selectOption('poster');await page.getByRole('combobox',{name:'Kampagne',exact:true}).selectOption('Brunch');await page.getByRole('combobox',{name:'Placering',exact:true}).selectOption('Vindue');await page.getByRole('button',{name:'Vis statistik'}).click();
  assert.deepEqual(JSON.parse(await page.getByTestId('filter-calls').textContent()),[{dateFrom:'2026-10-01',dateTo:'2026-10-21',qrId:'poster',campaign:'Brunch',placement:'Vindue'}]);
  await page.getByLabel('Fra dato',{exact:true}).fill('2026-11-01');await page.getByRole('button',{name:'Vis statistik'}).click();await expect(page.getByRole('alert')).toBeVisible();assert.equal(JSON.parse(await page.getByTestId('filter-calls').textContent()).length,1);
});
test('unknown visitor identity stays unknown with known-key and missing-key explanation',async t=>{
  const page=await pageFor(t,'unknown');await expect(stat(page,'Estimerede unikke')).toHaveText('Ukendt');await expect(page.getByText('scanninger mangler besøgsnøgle',{exact:false})).toBeVisible();
});
test('truncated results disclose incompleteness and disable every unique estimate and CSV',async t=>{
  const page=await pageFor(t,'partial');await expect(page.getByRole('alert')).toContainText('Ufuldstændige data');await expect(stat(page,'Estimerede unikke')).toHaveText('Ukendt');await expect(page.getByRole('button',{name:'Eksportér CSV'})).toBeDisabled();
  const rows=page.getByRole('table',{name:'Scanninger pr. dag'}).locator('tbody tr');for(const row of await rows.all())await expect(row.locator('td').last()).toHaveText('Ukendt');
});
test('loading retains data with busy label and disallows export/filter duplicate transport',async t=>{
  const page=await pageFor(t,'loading');await expect(page.getByRole('region',{name:'QR-statistik'}).getByRole('status')).toContainText('Indlæser statistik');await expect(page.getByRole('region',{name:'QR-statistik'})).toHaveAttribute('aria-busy','true');await expect(page.getByRole('button',{name:'Eksportér CSV'})).toBeDisabled();await expect(page.getByRole('button',{name:'Vis statistik'})).toBeDisabled();await expect(stat(page,'Registrerede åbninger')).toHaveText('4');
});
test('read errors retain labelled previous data, redact internal error and allow retry',async t=>{
  const page=await pageFor(t,'error');await expect(page.getByRole('alert')).toContainText('senest indlæste periode');assert.equal((await page.locator('body').innerText()).includes('internal-secret'),false);await expect(page.getByRole('button',{name:'Eksportér CSV'})).toBeDisabled();await page.getByRole('button',{name:'Prøv igen'}).click();await expect(page.getByTestId('retries')).toHaveText('1');
});
test('export permission hides control; allowed callback runs and failures remain retryable',async t=>{
  const denied=await pageFor(t,'denied');await expect(denied.getByRole('button',{name:'Eksportér CSV'})).toHaveCount(0);
  const page=await pageFor(t,'export-fail');await page.getByRole('button',{name:'Eksportér CSV'}).click();await expect(page.getByRole('alert')).toContainText('CSV kunne ikke eksporteres');await expect(page.getByTestId('exports')).toHaveText('1');await expect(page.getByRole('button',{name:'Eksportér CSV'})).toBeEnabled();
  const slow=await pageFor(t,'slow-export');await slow.getByRole('button',{name:'Eksportér CSV'}).click();await expect(slow.getByRole('button',{name:'Eksporterer…'})).toBeDisabled();await expect(slow.getByRole('button',{name:'Eksportér CSV'})).toBeEnabled();await expect(slow.getByTestId('exports')).toHaveText('1');
});
test('empty results and not-yet-loaded data are distinct',async t=>{
  const empty=await pageFor(t,'empty');await expect(stat(empty,'Registrerede åbninger')).toHaveText('0');await expect(stat(empty,'Estimerede unikke')).toHaveText('0');await expect(empty.getByRole('img')).toHaveCount(0);
  const none=await pageFor(t,'none');await expect(none.getByRole('region',{name:'QR-statistik'}).getByRole('status')).toContainText('Vælg en periode');await expect(none.locator('dl')).toHaveCount(0);await expect(none.getByRole('button',{name:'Eksportér CSV'})).toBeDisabled();
});
test('390px mobile keeps tables scrollable without page-width overflow',async t=>{
  const page=await pageFor(t,'',390);await expect(page.getByRole('table',{name:'Scanninger pr. dag'})).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
});

 test('ongoing complete snapshot shows update time, enables CSV and preserves unknown unique',async t=>{
 const page=await pageFor(t,'provisional');
 await expect(page.getByRole('note',{name:'Foreløbige tal'})).toContainText('26.10.2026');
 await expect(page.getByRole('note',{name:'Foreløbige tal'})).toContainText('14.00');
 await expect(page.getByRole('alert')).toHaveCount(0);
 await expect(stat(page,'Estimerede unikke')).toHaveText('Ukendt');
 await page.getByRole('button',{name:'Eksportér CSV'}).click();await expect(page.getByTestId('exports')).toHaveText('1');
 const partial=await pageFor(t,'partial');await expect(partial.getByRole('note',{name:'Foreløbige tal'})).toHaveCount(0);await expect(partial.getByRole('button',{name:'Eksportér CSV'})).toBeDisabled();
 });
