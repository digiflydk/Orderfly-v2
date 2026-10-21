// Actual sidebar component; shell primitives, identity lookup and navigation are fixtures.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),http=require('node:http');
const {chromium}=require('@playwright/test');
const webpackModule=require('next/dist/compiled/webpack/webpack');webpackModule.init();
const root=process.cwd();let dir,server,browser,origin;
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'qr-access-browser-'));
 const write=(name,text)=>{const p=path.join(dir,name);fs.writeFileSync(p,text);return p;};
 const shell=write('shell.js',`import React from 'react';
  export const Sidebar=({children,...props})=>React.createElement('aside',{'aria-label':'Administration'},children);
  export const SidebarContent=({children})=>React.createElement('div',null,children);
  export const SidebarFooter=SidebarContent,SidebarGroup=SidebarContent,SidebarGroupContent=({children,className})=>React.createElement('div',{className},children),SidebarMenu=SidebarContent,SidebarMenuItem=SidebarContent,SidebarMenuButton=SidebarContent;`);
 const link=write('link.js',`import React from 'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}`);
 const image=write('image.js',`import React from 'react';export default function Image({alt}){return React.createElement('span',{'aria-label':alt})}`);
 const navigation=write('navigation.js',`export const usePathname=()=>'/superadmin/qr-codes';`);
 const identity=write('identity.js',`export const getSuperadminUserContext=async()=>null;`);
 const logout=write('logout.js',`export const LogoutButton=()=>null;`);
 const entry=write('entry.js',`import React from 'react';import {createRoot} from 'react-dom/client';import {SuperAdminSidebarClient} from ${JSON.stringify(path.join(root,'src/components/superadmin/sidebar-client.tsx'))};
  const mode=new URLSearchParams(location.search).get('mode');
  const permissions=mode==='view'?['orderfly.qr_codes:view']:mode==='edit'?['orderfly.qr_codes:edit']:mode==='analytics'?['orderfly.analytics:view']:[];
  createRoot(document.getElementById('root')).render(React.createElement(SuperAdminSidebarClient,{access:mode==='anonymous'?null:{superuser:mode==='owner',permissions}}));`);
 const loader=write('loader.js',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;`);
 await new Promise((resolve,reject)=>webpackModule.webpack({mode:'development',devtool:false,entry,output:{path:dir,filename:'bundle.js'},
  resolve:{alias:{'@/components/ui/sidebar':shell,'@/components/superadmin/admin-link':link,'next/image':image,'next/navigation':navigation,'@/lib/auth/superadmin-context':identity,
   '@':path.join(root,'src'),'react$':require.resolve('next/dist/compiled/react'),'react/jsx-runtime$':require.resolve('next/dist/compiled/react/jsx-runtime'),
   'react-dom$':require.resolve('next/dist/compiled/react-dom'),'react-dom/client$':require.resolve('next/dist/compiled/react-dom/client')},extensions:['.tsx','.ts','.js'],modules:[path.join(root,'node_modules'),'node_modules']},
  plugins:[new webpackModule.webpack.NormalModuleReplacementPlugin(/^\.\/logout-button$/,logout)],
  module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:[loader]}]}
 }).run((error,stats)=>error?reject(error):stats.hasErrors()?reject(Error(stats.toString({all:false,errors:true}))):resolve()));
 server=http.createServer((req,res)=>{if(req.url.startsWith('/bundle.js')){res.setHeader('content-type','application/javascript');return res.end(fs.readFileSync(path.join(dir,'bundle.js')));}
  res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="da"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>.hidden{display:none}svg{width:20px;height:20px}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,executablePath:process.env.CART_CHROMIUM_PATH,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));if(dir)fs.rmSync(dir,{recursive:true,force:true});});
for(const width of [390,1440]){
 test(`sidebar opens the QR link for an explicit viewer at ${width}px`,async()=>{
  const page=await browser.newPage({viewport:{width,height:900}});
  try{await page.goto(origin+'/?mode=view');await page.getByRole('button',{name:'Promotions',exact:true}).click();
   const link=page.getByRole('link',{name:'QR-koder',exact:true});assert.equal(await link.getAttribute('href'),'/superadmin/qr-codes');assert.equal(await link.isVisible(),true);
   assert.equal(await page.getByRole('link',{name:'Customers',exact:true}).count(),0);
  }finally{await page.close();}
 });
 test(`sidebar hides QR for absent, action-only and unrelated grants at ${width}px`,async()=>{
  const page=await browser.newPage({viewport:{width,height:900}});
  try{for(const mode of ['anonymous','edit','analytics']){await page.goto(origin+'/?mode='+mode);await page.getByRole('complementary',{name:'Administration'}).waitFor();
    assert.equal(await page.getByRole('link',{name:'QR-koder',exact:true}).count(),0,mode);
   }}finally{await page.close();}
 });
}
