// Real cookie report, calendar and filters; synthetic read transport only.
const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), http = require('node:http');
const {chromium, expect} = require('@playwright/test');
const webpackModule = require('next/dist/compiled/webpack/webpack');
webpackModule.init();
const root = process.cwd();
let dir, server, browser, origin;
function file(name, code) {
  const target = path.join(dir, name + '.js'); fs.writeFileSync(target, code); return target;
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'system-settings-browser-'));
  const entry = file('entry', `import React from 'react';import {createRoot} from 'react-dom/client';
    import {SettingsForm} from ${JSON.stringify(path.join(root,'src/components/superadmin/settings/settings-form.tsx'))};
    import {CookieTextsFormPage} from ${JSON.stringify(path.join(root,'src/app/superadmin/settings/cookie-texts/form-page.tsx'))};
    import {getDefaultCookieTexts} from ${JSON.stringify(path.join(root,'src/lib/cookie-texts.ts'))};
    import {Toaster} from ${JSON.stringify(path.join(root,'src/components/ui/toaster.tsx'))};
    const keys={publishableKey:'fixture-public',secretKey:'fixture-private',webhookSecret:'fixture-hook'};
    createRoot(document.getElementById('root')).render(<main className="p-4"><Toaster/>{location.pathname==='/cookies'
      ? <CookieTextsFormPage textSet={{...getDefaultCookieTexts('da'),id:'text',brand_id:'brand'}} brands={[{id:'brand',name:'Brand'}]} supportedLanguages={[{code:'da',name:'Dansk'},{code:'en',name:'English'}]}/>
      : <SettingsForm initialPaymentGatewaySettings={{activeMode:'test',test:keys,live:keys}} initialLanguageSettings={{supportedLanguages:[{code:'da',name:'Dansk'}]}} initialBrandingSettings={{platformLogoUrl:null}}/>}</main>);`);
  const actions=file('actions', `export async function createOrUpdateCookieTexts(form){window.saved=Object.fromEntries(form);return {error:'Fixture storage unavailable'};}
    export async function updateBrandingSettings(){return {error:false,message:'Saved'};}
    export async function updatePaymentGatewaySettings(){return {error:false,message:'Saved'};}
    export async function updateLanguageSettings(){return {error:false,message:'Saved'};}`);
  const link=file('link', `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>}`);
  const picture=file('picture', `import React from 'react';export default function Image(props){return <img {...props}/>}`);
  const loader = file('ts-loader', `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
  await new Promise((resolve, reject) => webpackModule.webpack({
    mode:'development', devtool:false, entry, output:{path:dir, filename:'bundle.js'},
    plugins:[new webpackModule.webpack.NormalModuleReplacementPlugin(/^\.\/actions$/, resource => {
      if (resource.context === path.join(root, 'src/app/superadmin/settings/cookie-texts')) resource.request = actions;
    })],
    resolve:{alias:{'@/app/superadmin/settings/actions':actions,'@/components/superadmin/admin-link':link,'next/image':picture,'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime':require.resolve('next/dist/compiled/react/jsx-runtime'),'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client':require.resolve('next/dist/compiled/react-dom/client'),'@':path.join(root, 'src')}, extensions:['.tsx','.ts','.js'], modules:[path.join(root, 'node_modules'),'node_modules']},
    module:{rules:[{test:/\.[jt]sx?$/, exclude:/node_modules/, use:[loader]}]},
  }).run((error, stats) => error ? reject(error) : stats.hasErrors() ? reject(Error(stats.toString({all:false,errors:true}))) : resolve()));
  const css = await require('postcss')([require('tailwindcss')({config:path.join(root, 'tailwind.config.ts')})])
    .process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), {from:path.join(root, 'src/app/globals.css')});
  server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') {res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
    if (req.url === '/style.css') {res.setHeader('content-type','text/css');return res.end(css.css);}
    res.setHeader('content-type','text/html');
    res.end('<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({headless:true, executablePath:process.env.CART_CHROMIUM_PATH, args:['--no-sandbox','--disable-dev-shm-usage']});
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (dir) fs.rmSync(dir, {recursive:true,force:true});
});


for(const width of [1280,390])test(`System settings and cookie editing at ${width}px`,async t=>{
 const context=await browser.newContext({viewport:{width,height:900}});t.after(()=>context.close());const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await expect(page.getByRole('tab',{name:'Branding',exact:true})).toBeVisible();
 await expect(page.getByRole('tab',{name:'Analytics',exact:true})).toHaveCount(0);await expect(page.getByLabel('Platform Favicon URL')).toHaveCount(0);await expect(page.getByLabel('Browser Heading (tab title)')).toHaveCount(0);
 await page.getByRole('tab',{name:'Payment Gateway',exact:true}).click();await expect(page.getByText('Payment Gateway (Stripe)',{exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Languages',exact:true}).click();await expect(page.getByPlaceholder('Language Name (e.g., English)')).toHaveValue('Dansk');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.goto(origin+'/cookies');await expect(page.getByLabel('Statistics: Title',{exact:true})).toHaveValue('Statistik');await expect(page.getByLabel('Marketing: Title',{exact:true})).toHaveValue('Marketing');
 await expect(page.getByLabel('Performance: Title',{exact:true})).toHaveCount(0);
 await page.getByRole('combobox',{name:'Brand (Optional)'}).click();await page.getByRole('option',{name:'Global (Default)',exact:true}).click();
 await page.getByRole('button',{name:'Save Changes',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.saved?.cat_marketing_title)).toBe('Marketing');
 assert.equal(await page.evaluate(()=>window.saved.brand_id),undefined);await expect(page.getByText('Fixture storage unavailable',{exact:true})).toBeVisible();
 assert.deepEqual(errors,[]);
});
