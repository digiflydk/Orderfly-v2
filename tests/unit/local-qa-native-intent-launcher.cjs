'use strict';
const { test }=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{EventEmitter}=require('node:events');
const {environment}=require('../../scripts/local-qa/environment.cjs');
const {intentEnvironment}=require('../../scripts/local-qa/intent-environment.cjs');
async function fixture(mode='success') {
  const children=[],events=[],calls=[];let pass=0;
  const proc={env:{QA0_FIREBASE_BIN:'/tools/firebase',QA0_JAVA_BIN:'/tools/java'},execPath:process.execPath,kill(pid){const c=children.find(c=>c.pid===-pid);c.exitCode=1;events.push('teardown');}};
  const io={spawn(command,args,opts){calls.push({command,args,env:opts.env});const c=Object.assign(new EventEmitter(),{pid:children.length+1,exitCode:null,stdout:new EventEmitter(),stderr:new EventEmitter(),kill(){this.exitCode=1;}});children.push(c);
    if(args.some(a=>a.endsWith('native-intent-smoke.cjs'))){pass++;events.push('proof');if(mode!=='timeout')queueMicrotask(()=>{const good={nativeExecution:true,cleanupVerified:true,productionAcceptance:false,physicalPrintVerified:false};if(mode==='bad-evidence')good.cleanupVerified=false;c.stdout.emit('data',mode==='oversize'?'x'.repeat(17000):JSON.stringify(good));c.exitCode=mode==='second-failure'&&pass===2?1:0;c.emit('exit',c.exitCode);});}return c;},spawnSync(_cmd,args){return {status:0,stdout:args[0]==='--version'?'15.30.0':'',stderr:'openjdk version "21.0.12"'};}};
  const mocks={'node:child_process':io,'node:path':path,'node:fs':{mkdtempSync:()=>'/tmp/test',chmodSync(){},openSync:()=>1,closeSync(){},existsSync:p=>p.startsWith('/tools/')},'node:net':{createServer:()=>({once(){return this;},listen(_p,_h,cb){cb();},close(cb){cb();}})},'./environment.cjs':{environment},'./intent-environment.cjs':{intentEnvironment}};
  const module={exports:{}},req=name=>mocks[name];req.main={};
  const timer=fn=>{const t={active:true};queueMicrotask(()=>{if(t.active)fn();});return t;};
  new Function('require','module','process','console','__dirname','fetch','setTimeout','clearTimeout',fs.readFileSync('scripts/local-qa/run-backend.cjs','utf8'))(req,module,proc,{log(){assert.fail('import must not run ordinary QA');},error(){}},path.resolve('scripts/local-qa'),async()=>({status:200}),timer,t=>t.active=false);
  assert.equal(children.length,0,'import must not launch any child');
  let result,error;try{result=await module.exports.runNativeIntentProof();}catch(e){error=e;}
  return {result,error,events,calls};
}
test('fixed native launcher starts only emulators and two guarded children in one lifetime',async()=>{const r=await fixture();assert.ifError(r.error);assert.equal(r.result.sameEmulatorPasses,2);assert.deepEqual(r.events,['proof','proof','teardown']);assert.equal(r.calls.length,3);assert.ok(!r.calls.some(c=>c.args.some(a=>a.includes('/next/'))));for(const c of r.calls.slice(1)){assert.equal(c.env.ORDERFLY_PRINT_INTENTS_ENABLED,'true');assert.equal(c.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED,'false');assert.equal(c.env.NODE_OPTIONS,require('../../scripts/local-qa/environment.cjs').environment().NODE_OPTIONS);assert.equal(c.env.STRIPE_SECRET_KEY,undefined);}});
for(const mode of ['second-failure','bad-evidence','oversize','timeout'])test(`native launcher rejects ${mode} and still tears down`,async()=>{const r=await fixture(mode);assert.ok(r.error);assert.equal(r.result,undefined);assert.ok(r.events.includes('teardown'));assert.ok(!r.error.message.includes('private'));});
