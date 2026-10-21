// Real production client + real metric aggregation; only server/auth/transport are absent.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const { chromium, expect } = require('@playwright/test');
const webpack = require('next/dist/compiled/webpack/webpack');
let dir, server, browser, origin;
const root = process.cwd();

before(async () => {
  webpack.init(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qr-attribution-browser-'));
  const file = (name, source) => { const target = path.join(dir, name+'.js'); fs.writeFileSync(target, source); return target; };
  const entry = file('entry', `import React from 'react';import {createRoot} from 'react-dom/client';
    import {QrAnalytics} from ${JSON.stringify(path.join(root,'src/app/superadmin/qr-codes/qr-analytics.tsx'))};
    import {aggregateQrMetrics,classifyQrRequest} from ${JSON.stringify(path.join(root,'src/lib/qr/metrics.ts'))};
    const mode=new URLSearchParams(location.search).get('mode');
    const classified=classifyQrRequest({method:'GET',userAgent:'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1',referrer:'https://example.com/path?secret=1'});
    const make=(iso,key,extra={})=>({timestamp:Date.parse(iso),qrId:'poster',classification:classified,visitorKey:key,...extra});
    const events=[make('2026-10-25T00:30:00Z','a'),make('2026-10-25T01:30:00Z','a'),make('2026-10-26T12:00:00Z',mode==='unknown'?null:'b'),make('2026-10-26T12:01:00Z',null,{classification:classifyQrRequest({method:'GET',userAgent:'Googlebot'})})];
    const metrics=aggregateQrMetrics(mode==='empty'?[]:events,{from:Date.parse('2026-10-25T00:00:00Z'),to:Date.parse('2026-10-27T00:00:00Z')});
    const codes=[{id:'poster',name:'Brunch-plakat',campaign:'Brunch',placement:'Vindue'},{id:'table',name:'Bordkort',campaign:'Club',placement:'Bord'}];
    function App(){const [calls,setCalls]=React.useState([]);const [exported,setExported]=React.useState(0);const [retries,setRetries]=React.useState(0);
      return <><QrAnalytics metrics={mode==='none'?null:metrics} codes={codes} period={{dateFrom:'2026-10-25',dateTo:'2026-10-26'}}
        attribution={mode==='no-attribution'?undefined:{byCampaign:[{key:'Old campaign',openings:1,probableScans:1,excludedOpenings:0},{key:'New campaign',openings:2,probableScans:1,excludedOpenings:1},{key:'',openings:1,probableScans:1,excludedOpenings:0}],byLocation:[{key:'retired-location',openings:2,probableScans:2,excludedOpenings:0},{key:'new-location',openings:1,probableScans:0,excludedOpenings:1},{key:'',openings:1,probableScans:1,excludedOpenings:0}]}} canExport={mode!=='denied'} complete={mode!=='partial'} loading={mode==='loading'} error={mode==='error'?'internal-secret':null}
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

test('historical groups use server event snapshots rather than current catalog campaign',async t=>{
 const page=await pageFor(t);const campaigns=page.getByRole('table',{name:'Kampagner ved scanning',exact:true});await expect(campaigns.getByRole('rowheader',{name:'Old campaign',exact:true})).toBeVisible();await expect(campaigns.getByRole('rowheader',{name:'New campaign',exact:true})).toBeVisible();await expect(campaigns.getByRole('rowheader',{name:'Ukendt kampagne',exact:true})).toBeVisible();await expect(campaigns.getByRole('rowheader',{name:'Brunch',exact:true})).toHaveCount(0);
 const historic=page.getByRole('region',{name:'Fordeling på scanningstidspunktet'});await expect(historic).toContainText('valgte QR-kode');await expect(historic).toContainText('på scanningstidspunktet');
 const locations=page.getByRole('table',{name:'Afdelinger ved scanning',exact:true});await expect(locations.getByRole('rowheader',{name:'Afdeling retired-location',exact:true})).toBeVisible();await expect(locations.getByRole('rowheader',{name:'Uden registreret afdeling',exact:true})).toBeVisible();
 const row=campaigns.getByRole('row').filter({has:page.getByRole('rowheader',{name:'New campaign',exact:true})});assert.deepEqual(await row.locator('td').allTextContents(),['2','1','1']);
});
test('missing optional historical groups are explicitly unavailable and never synthesized from catalog',async t=>{
 const page=await pageFor(t,'no-attribution');await expect(page.getByRole('note',{name:'Historisk fordeling',exact:true})).toContainText('ikke tilgængelig');await expect(page.getByRole('table',{name:'Kampagner ved scanning',exact:true})).toHaveCount(0);await expect(page.getByRole('table',{name:'QR-koder, kampagner og placeringer',exact:true})).toBeVisible();
});
test('historical attribution tables remain usable on a narrow viewport',async t=>{
 const page=await pageFor(t,'',390);await expect(page.getByRole('table',{name:'Afdelinger ved scanning',exact:true})).toBeVisible();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
});
