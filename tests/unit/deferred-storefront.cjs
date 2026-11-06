const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),ts=require('typescript');
const {loadTs}=require('../helpers/load-ts.cjs');
test('a tracking import cannot grant consent after revocation or component cleanup',async()=>{
 let consent={statistics:false,marketing:false},cleanup,imports=0,mounts=0,stops=0;
 const listeners=new Map();const previousWindow=global.window;
 global.window={addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
 try {
  const mocks={react:{useEffect:f=>{cleanup=f();}},'next/navigation':{usePathname:()=>'/amager'},'@/lib/analytics':{trackingConsent:()=>consent,clearRejectedTrackingCookies:()=>{}},'@/lib/loyalty/portal-path':{isClubPath:()=>false}};
  const code=ts.transpileModule(fs.readFileSync('src/components/brand-tracking.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod={exports:{}};new Function('require','module','exports',code)(name=>{
   if(name==='@/lib/brand-tracking-frame'){imports++;return {mountBrandTracking:()=>{mounts++;return ()=>stops++;}};}
   assert.ok(name in mocks,name);return mocks[name];
  },mod,mod.exports);
  mod.exports.BrandTracking({brand:{id:'b'}});
  await new Promise(setImmediate);assert.equal(imports,0);assert.equal(mounts,0);
  consent={statistics:true,marketing:false};listeners.get('orderfly:consent')();
  consent={statistics:false,marketing:false};listeners.get('orderfly:consent')();
  await new Promise(setImmediate);assert.equal(mounts,0);
  consent={statistics:true,marketing:false};listeners.get('orderfly:consent')();
  await new Promise(setImmediate);assert.equal(mounts,1);
  consent={statistics:true,marketing:true};listeners.get('orderfly:consent')();cleanup();
  await new Promise(setImmediate);assert.equal(mounts,1);assert.equal(stops,1);assert.equal(listeners.size,0);
 } finally {global.window=previousWindow;}
});
test('optional session work waits for two animation frames and is cancellable during the idle wait',()=>{
 const previousWindow=global.window;let next=0,work=0;const frames=new Map(),idle=new Map();
 global.window={requestAnimationFrame:fn=>{frames.set(++next,fn);return next;},cancelAnimationFrame:id=>frames.delete(id),requestIdleCallback:fn=>{idle.set(++next,fn);return next;},cancelIdleCallback:id=>idle.delete(id),clearTimeout:()=>{}};
 const frame=()=>{const [id,fn]=frames.entries().next().value;frames.delete(id);fn();};
 try{const {afterFirstPaint}=loadTs('src/lib/after-first-paint.ts');const cancel=afterFirstPaint(()=>work++);assert.equal(work,0);frame();assert.equal(idle.size,0);frame();assert.equal(work,0);cancel();assert.equal(idle.size,0);assert.equal(work,0);
 afterFirstPaint(()=>work++);frame();frame();idle.values().next().value();assert.equal(work,1);
 }finally{global.window=previousWindow;}
});
