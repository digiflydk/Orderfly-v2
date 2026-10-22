'use strict';
const fs = require('node:fs'), path = require('node:path');
const { intentEnvironment } = require('./intent-environment.cjs');
const root = path.resolve(__dirname, '../..');

function intentPreflight() {
  // Next reads dotenv independently of a sanitized child environment. Reject
  // the same development files as QA0 without opening any secret-bearing file.
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) {
    if (fs.existsSync(path.join(root, name))) throw Error('Local QA intent checkout requires no dotenv files');
  }
  const env = intentEnvironment();
  if (env.GCLOUD_PROJECT !== 'demo-orderfly-qa0'
    || env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088'
    || env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
    || env.SITE_URL !== 'http://127.0.0.1:3100'
    || env.ORDERFLY_PRINT_INTENTS_ENABLED !== 'true'
    || env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'false') throw Error('Local QA intent preflight rejected');
  return Object.freeze({ status: 'preflight-only', environment: 'QA490-local-intents', project: env.GCLOUD_PROJECT,
    nativeExecution: false, runtimeBindingAvailable: false, productionAcceptance: false, physicalPrintVerified: false });
}
function main(args = process.argv.slice(2)) {
  // There is deliberately no arbitrary callback/module loader, environment
  // override, emulator bootstrap or success default before the fixed native
  // fixture/settlement owner has been implemented and independently reviewed.
  if (args.length !== 1 || args[0] !== '--preflight') throw Error('Local QA intent native binding unavailable; only --preflight is supported');
  console.log(JSON.stringify(intentPreflight()));
}
if (require.main === module) {
  try { main(); } catch { console.error('Local QA intent preflight rejected or native binding unavailable'); process.exitCode = 1; }
}
module.exports = { intentPreflight, main };
