'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const runner = require('../local-qa/pilot-native-transaction.cjs');
test('pilot runner refuses production hosts, partial gates, credentials and missing network guard before SDK access', () => {
  const valid = runner.pilotEnvironment(); runner.assertRuntime(valid, true);
  assert.throws(()=>runner.assertRuntime(valid, false),/runtime rejected/);
  for (const patch of [{GCLOUD_PROJECT:'orderfly-39325'},{GOOGLE_CLOUD_PROJECT:'orderfly-v21-10334086-b3076'},
    {FIRESTORE_EMULATOR_HOST:'localhost:8088'},{FIREBASE_AUTH_EMULATOR_HOST:'remote:9099'},{NODE_ENV:'production'},
    {ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED:'false'},{ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED:undefined},
    {ORDERFLY_PRINT_INTENTS_ENABLED:'false'},{GOOGLE_APPLICATION_CREDENTIALS:''},{FB_SERVICE_ACCOUNT_JSON:'PRIVATE'},
    {STRIPE_SECRET_KEY:'PRIVATE'},{HTTP_PROXY:''},{NO_PROXY:'127.0.0.1'}]) {
    assert.throws(()=>runner.assertRuntime({...valid,...patch},true),e=>e.message==='Pilot native runtime rejected'&&!String(e).includes('PRIVATE'));
  }
});
test('child environment never inherits provider credentials or parent output declarations', () => {
  const before=process.env;process.env={PATH:before.PATH,STRIPE_SECRET_KEY:'PRIVATE',HTTP_PROXY:'PRIVATE',GOOGLE_APPLICATION_CREDENTIALS:'PRIVATE',ORDERFLY_PRINT_OUTPUT_ENABLED:'true'};
  try{const env=runner.pilotEnvironment();assert.equal(JSON.stringify(env).includes('PRIVATE'),false);assert.equal(Object.hasOwn(env,'ORDERFLY_PRINT_OUTPUT_ENABLED'),false);assert.equal(env.ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED,'true');}
  finally{process.env=before;}
});
test('preflight states fixture limits and cannot claim native/production/hardware proof', async () => {
  const proof=await runner.main(['--preflight']);assert.equal(proof.configuredAdminBindingFixture,true);assert.equal(proof.nextRequestContextFixture,true);
  assert.equal(proof.productionAcceptance,false);assert.equal(proof.physicalPrintVerified,false);assert.equal(proof.nativeExecution,undefined);
});
test('arbitrary command/module and unguarded direct child fail closed', async () => {
  for(const args of [[],['--module','/tmp/PRIVATE'],['--run','extra']]) await assert.rejects(runner.main(args),/arguments rejected/);
  const result=spawnSync(process.execPath,['tests/local-qa/pilot-native-transaction.cjs','--child'],{encoding:'utf8',env:{PATH:process.env.PATH}});
  assert.equal(result.status,1);assert.equal(result.stdout,'');assert.equal(result.stderr.trim(),'Pilot native transaction proof failed at runtime');
});
test('missing roots with preexisting orphan descendants reject before ownership or deletion', async()=>{
  const orphan={private:'preserve'},events=[];
  const db={doc:key=>({get:async()=>({exists:false}),listCollections:async()=>key==='locations/qa0-pilot-location'?['foreign']:[]}),
    runTransaction:()=>{events.push('write');throw Error('unexpected mutation');}};
  await assert.rejects(runner.assertVacantRoots(db),/orphan descendant/);
  assert.deepEqual(orphan,{private:'preserve'});assert.deepEqual(events,[]);
});
test('cleanup rejects changed record versions atomically and never touches unregistered descendants',async()=>{
  const deleted=[],foreign={private:'keep'},prior={isEqual:other=>other===prior},replacement={isEqual:()=>false};
  const key='brands/qa0-pilot-brand',expected=new Map([[key,prior]]);
  const db={doc:path=>({path}),runTransaction:run=>run({get:async ref=>({exists:true,ref,updateTime:replacement}),delete:ref=>deleted.push(ref.path)})};
  await assert.rejects(runner.cleanupRegistered(db,expected),/ownership changed/);
  assert.deepEqual(deleted,[]);assert.deepEqual(foreign,{private:'keep'});
});
test('an unregistered descendant survives exact cleanup and prevents a false clean PASS',async()=>{
  const key='locations/qa0-pilot-location',foreign=key+'/foreign/keep',version={isEqual:other=>other===version};
  const rows=new Map([[key,{owner:'run'}],[foreign,{private:'preserve'}]]),deleted=[];
  const doc=path=>({path,get:async()=>({exists:rows.has(path)}),listCollections:async()=>[...rows.keys()].some(p=>p.startsWith(path+'/'))?['foreign']:[]});
  const db={doc,runTransaction:run=>run({get:async ref=>({exists:rows.has(ref.path),ref,updateTime:version}),delete:ref=>{deleted.push(ref.path);rows.delete(ref.path);}})};
  await assert.rejects(runner.cleanupRegistered(db,new Map([[key,version]])),/orphan descendant/);
  assert.deepEqual(deleted,[key]);assert.deepEqual(rows.get(foreign),{private:'preserve'});
});
test('source identity includes tracked helper, environment and network guard changes',()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pilot-source-test-'));
  const files=['tests/helpers/load-ts-graph.cjs','scripts/local-qa/environment.cjs','scripts/local-qa/network-guard.cjs'];
  try{
    execFileSync('git',['init','-q'],{cwd:root});
    for(const file of files){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),'committed\n');}
    execFileSync('git',['add','.'],{cwd:root});
    execFileSync('git',['-c','user.name=QA','-c','user.email=qa@example.invalid','commit','-qm','fixture'],{cwd:root});
    assert.match(runner.assertCommittedSource(root),/^[a-f0-9]{40}$/);
    for(const file of files){fs.writeFileSync(path.join(root,file),'changed\n');assert.throws(()=>runner.assertCommittedSource(root),/sources must be committed/);fs.writeFileSync(path.join(root,file),'committed\n');}
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
