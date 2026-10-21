'use strict';
// LOCAL QA ONLY, observation-only. Loaded into the isolated demo app via NODE_OPTIONS.
// Wraps the real Firestore SDK runTransaction callback to COUNT attempts per transaction.
// All SDK reads/writes/commit/auth are delegated unchanged. Logs only a sequence number,
// attempt count, whether the transaction read the armed target document path, and the
// terminal outcome class/code. Never logs inputs, documents, tokens, cookies or payloads.
// Optional deterministic barrier: when armed, the matched transaction pauses at the START
// of attempt 2 (before any re-read) until the QA driver releases it.
const fs = require('node:fs'), path = require('node:path');
if (process.env.ORDERFLY_LOCAL_QA !== 'true' || process.env.GCLOUD_PROJECT !== 'demo-orderfly-qa0' || !process.env.QA_OBSERVER_DIR) {
  throw Error('QA observer requires the fixed local demo environment');
}
// Load the unchanged accepted loopback network guard FIRST (single --require keeps Next's NODE_OPTIONS intact).
require('/home/user/Orderfly-v2/scripts/local-qa/network-guard.cjs');
if (Reflect.get(globalThis, Symbol.for('orderfly.qa0.loopback-guard')) !== true) throw Error('guard missing');
const DIR = process.env.QA_OBSERVER_DIR;
const sdk = require('/home/user/Orderfly-v2/node_modules/@google-cloud/firestore');
const records = new WeakMap();
let seq = 0;
const read = name => { try { return fs.readFileSync(path.join(DIR, name), 'utf8').trim(); } catch { return null; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const originalGet = sdk.Transaction.prototype.get;
sdk.Transaction.prototype.get = function (refOrQuery, ...rest) {
  const rec = records.get(this);
  if (rec && rec.target && refOrQuery && refOrQuery.path === rec.target) rec.matched = true;
  return originalGet.call(this, refOrQuery, ...rest);
};
const originalRun = sdk.Firestore.prototype.runTransaction;
sdk.Firestore.prototype.runTransaction = function (updateFunction, options) {
  const rec = { seq: ++seq, attempts: 0, matched: false, target: read('target'), barrierUsed: false };
  const wrapped = async tx => {
    rec.attempts++;
    records.set(tx, rec);
    if (rec.attempts === 2 && rec.matched && !rec.barrierUsed && fs.existsSync(path.join(DIR, 'barrier'))) {
      rec.barrierUsed = true;
      fs.rmSync(path.join(DIR, 'barrier'), { force: true });
      fs.writeFileSync(path.join(DIR, 'attempt2-waiting'), String(rec.seq));
      const until = Date.now() + 30000;
      while (!fs.existsSync(path.join(DIR, 'release')) && Date.now() < until) await sleep(50);
      fs.rmSync(path.join(DIR, 'release'), { force: true });
    }
    return updateFunction(tx);
  };
  const log = (outcome, code) => fs.appendFileSync(path.join(DIR, 'attempts.log'), JSON.stringify({
    seq: rec.seq, attempts: rec.attempts, matched: rec.matched, barrier: rec.barrierUsed, outcome,
    ...(code !== undefined ? { code: typeof code === 'number' || typeof code === 'string' ? code : 'other' } : {}) }) + '\n');
  let started;
  try { started = originalRun.call(this, wrapped, options); } catch (e) { log('sync-error', String(e && e.message).slice(0, 120)); throw e; }
  return started.then(v => { log('committed'); return v; }, e => { log('error', e && (e.code ?? e.status)); throw e; });
};
fs.writeFileSync(path.join(DIR, 'observer-loaded'), String(process.pid));
