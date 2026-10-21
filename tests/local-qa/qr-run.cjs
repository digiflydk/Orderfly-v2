'use strict';
// QR-only orchestration. The fixed QA0 environment and network guard are reused unchanged.
const {spawn,spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs'),net=require('node:net');
const {environment}=require('../../scripts/local-qa/environment.cjs');
const root=path.resolve(__dirname,'../..'),env={...environment(),QR_MODULE_ENABLED:'true'};
delete env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
const apiOnly=process.argv.includes('--api-only');
const children=[],logs=[],privateDir=fs.mkdtempSync('/tmp/orderfly-qr-qa0-');fs.chmodSync(privateDir,0o700);
function launch(command,args,childEnv,label,cwd=root){const log=path.join(privateDir,label+'.log'),fd=fs.openSync(log,'wx',0o600);logs.push(log);const child=spawn(command,args,{cwd,env:childEnv,stdio:['ignore',fd,fd],detached:true});fs.closeSync(fd);children.push(child);return child;}
async function ready(url,child){const until=Date.now()+90000;while(Date.now()<until){if(child.exitCode!==null)throw Error('QR_QA0_CHILD_EXITED');try{const r=await fetch(url,{signal:AbortSignal.timeout(2000)});if(r.status<500)return;}catch{}await new Promise(resolve=>setTimeout(resolve,400));}throw Error('QR_QA0_READINESS_TIMEOUT');}
(async()=>{
 const firebase=process.env.QA0_FIREBASE_BIN,java=process.env.QA0_JAVA_BIN,browser=process.env.CART_CHROMIUM_PATH;
 if(!firebase||!java||![firebase,java].every(p=>path.isAbsolute(p)&&fs.existsSync(p)))throw Error('QR_QA0_EXPLICIT_TOOLS_REQUIRED');
 if(!apiOnly&&(!browser||!path.isAbsolute(browser)||!fs.existsSync(browser)))throw Error('QR_QA0_BROWSER_REQUIRED');
 for(const name of ['.env','.env.local','.env.development','.env.development.local'])if(fs.existsSync(path.join(root,name)))throw Error('QR_QA0_DOTENV_FORBIDDEN');
 const toolsEnv={PATH:path.dirname(java)+path.delimiter+env.PATH,LANG:env.LANG,TZ:env.TZ,CI:'true',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true',FIREBASE_CLI_DISABLE_USAGE_REPORTING:'true'};
 const cli=spawnSync(firebase,['--version'],{env:toolsEnv,encoding:'utf8'}),jre=spawnSync(java,['-version'],{env:toolsEnv,encoding:'utf8'});
 if(cli.status!==0||cli.stdout.trim()!=='15.30.0'||jre.status!==0||!/version "21\./.test(jre.stderr))throw Error('QR_QA0_PINNED_TOOLS_REQUIRED');
 for(const port of [3100,8088,9099,4400,4500,9150])await new Promise((resolve,reject)=>{const probe=net.createServer();probe.once('error',()=>reject(Error('QR_QA0_UNUSED_PORTS_REQUIRED')));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});
 const emulator=launch(firebase,['emulators:start','--project','demo-orderfly-qa0','--only','auth,firestore','--config',path.join(root,'tests/local-qa/firebase.json')],toolsEnv,'emulators',privateDir);
 await ready('http://127.0.0.1:9099/emulator/v1/projects/demo-orderfly-qa0/config',emulator);await ready('http://127.0.0.1:8088/',emulator);
 const app=launch(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'dev','-p','3100','-H','127.0.0.1'],env,'app');await ready('http://127.0.0.1:3100/api/health',app);
 const results=[];
 for(let pass=0;pass<2;pass++){
  const smoke=spawn(process.execPath,[path.join(__dirname,'qr-smoke.cjs'),...(apiOnly?['--api-only']:[])],{cwd:root,env:{...env,...(!apiOnly?{CART_CHROMIUM_PATH:browser}:{})},stdio:['ignore','pipe','pipe']});children.push(smoke);let output='',diagnostic='';smoke.stdout.on('data',chunk=>{output+=chunk;});smoke.stderr.on('data',chunk=>{if(diagnostic.length<512)diagnostic+=chunk;});
  const code=await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>{smoke.kill('SIGKILL');reject(Error('QR_QA0_SMOKE_TIMEOUT'));},120000);smoke.once('error',()=>{clearTimeout(deadline);reject(Error('QR_QA0_SMOKE_FAILED'));});smoke.once('exit',code=>{clearTimeout(deadline);resolve(code);});});
  if(code!==0){const fixed=diagnostic.match(/^QR_QA0_SMOKE_FAILED_PHASE_[a-z_0-9]+$/m)?.[0];throw Error(fixed||'QR_QA0_SMOKE_FAILED');}results.push(JSON.parse(output));
 }
 console.log(JSON.stringify({...results[1],sameEmulatorPasses:results.length}));
})().catch(error=>{console.error(error.message);console.error('Protected QR QA0 logs:',logs.join(', '));process.exitCode=1;}).finally(()=>{for(const child of children.reverse())if(child.exitCode===null){try{process.kill(-child.pid,'SIGTERM');}catch{child.kill('SIGTERM');}}});
