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
