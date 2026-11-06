// Real SSR/React hydration with the menu boundary becoming interactive before its header.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const React=require('react'),{renderToString}=require('react-dom/server');
const ts=require('typescript'),{chromium}=require('@playwright/test');
const wp=require('next/dist/compiled/webpack/webpack');wp.init();
let dir,server,browser,origin;
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'toolbar-hydration-'));
 const source=path.resolve('src/components/layout/menu-toolbar-slots.tsx');
 const code=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
 const mod={exports:{}};new Function('require','module','exports',code)(require,mod,mod.exports);
 const header=renderToString(React.createElement(mod.exports.MenuToolbarSlots,{brandSlug:'esmeralda',locationId:'amager'}));
 const entry=path.join(dir,'entry.js'),loader=path.join(dir,'loader.js');
 fs.writeFileSync(loader,`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 fs.writeFileSync(entry,`import React,{useEffect,useState} from 'react';import{hydrateRoot}from'react-dom/client';import{createPortal}from'react-dom';import{MenuToolbarSlots,useMenuToolbarSlots}from${JSON.stringify(source)};
 window.recoveries=[];const options={onRecoverableError:(error,info)=>window.recoveries.push({message:error.message,stack:info.componentStack})};
 function Menu(){const[current,setCurrent]=useState('amager');window.changeLocation=setCurrent;const slots=useMenuToolbarSlots('esmeralda',current);useEffect(()=>{window.menuReady=true;},[]);return slots?<>{createPortal(<button onClick={()=>window.clicked=true}>Afhentning</button>,slots.controls)}{createPortal(<button>Kurv</button>,slots.cart)}</>:null;}
 const menu=hydrateRoot(document.getElementById('menu'),<Menu/>,options);let header;
 window.hydrateHeader=()=>{header=hydrateRoot(document.getElementById('header'),<MenuToolbarSlots brandSlug="esmeralda" locationId="amager"/>,options);};
 window.removeHeader=()=>header.unmount();
 window.replaceHeader=()=>{header.render(<MenuToolbarSlots brandSlug="esmeralda" locationId="other"/>);};
 `);
 await new Promise((resolve,reject)=>wp.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],modules:[path.resolve('node_modules'),'node_modules']},module:{rules:[{test:/\.[jt]sx?$/,exclude:/node_modules/,use:[loader]}]}}).run((e,s)=>e?reject(e):s.hasErrors()?reject(Error(s.toString({all:false,errors:true}))):resolve()));
 server=http.createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(fs.readFileSync(path.join(dir,'bundle.js')));}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><header id="header">'+header+'</header><main id="menu"></main><script src="/bundle.js"></script></body></html>');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CART_CHROMIUM_PATH,headless:true});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
for(const width of [320,390,768,1280])test(`portal waits for header hydration and retains working controls at ${width}px`,async t=>{
 const context=await browser.newContext({viewport:{width,height:900}});t.after(()=>context.close());const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.waitForFunction(()=>window.menuReady);
 assert.equal(await page.locator('[data-menu-controls-slot]').innerHTML(),'');
 assert.equal(await page.getByRole('button').count(),0);
 await page.evaluate(()=>window.hydrateHeader());await page.getByRole('button',{name:'Afhentning'}).click();assert.equal(await page.evaluate(()=>window.clicked),true);
 assert.deepEqual(await page.evaluate(()=>window.recoveries),[]);
 // A new route cannot reuse a previous location's portal targets.
 await page.evaluate(()=>window.changeLocation('other'));await page.getByRole('button').first().waitFor({state:'hidden'});
 await page.evaluate(()=>window.replaceHeader());await page.getByRole('button',{name:'Afhentning'}).waitFor();
 await page.evaluate(()=>window.removeHeader());await page.getByRole('button').first().waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.recoveries),[]);
});
