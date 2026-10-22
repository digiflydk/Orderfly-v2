'use strict';
// Fixed entrypoints, actual source and installed packages. No mock/module-map input.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const ts = require('typescript'), { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '../..'), SRC = path.join(ROOT, 'src') + path.sep;
function loadNativeIntentSource() {
  if (process.env.ORDERFLY_LOCAL_QA_INTENT_PROOF !== 'true'
    || Reflect.get(globalThis, Symbol.for('orderfly.qa0.loopback-guard')) !== true) throw Error('QA511 source boundary rejected');
  require('./native-intent-fixture.cjs').assertRuntime();
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw Error('QA511 source identity rejected');
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=no', '--', 'src', 'scripts/local-qa'], { cwd: ROOT, encoding: 'utf8' });
  if (status.trim()) throw Error('QA511 source is not committed');
  const resolve = Module._resolveFilename;
  Module._resolveFilename = function(request, parent, ...rest) {
    const target = request === 'react' ? 'next/dist/compiled/react'
      : request.startsWith('@/') ? path.join(ROOT, 'src', request.slice(2)) : request;
    return resolve.call(this, target, parent, ...rest);
  };
  const prior = Module._extensions['.ts'];
  Module._extensions['.ts'] = function(module, filename) {
    if (!filename.startsWith(SRC)) throw Error('QA511 source path rejected');
    // Next consumes this compile-time boundary marker. The standalone bridge
    // has already enforced its stronger fixed isolated-runtime guard above.
    const source = fs.readFileSync(filename, 'utf8').replace(/^import ['"]server-only['"];\s*$/gm, '');
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    }, fileName: filename }).outputText;
    module._compile(code, filename);
  };
  const restore = () => { Module._resolveFilename = resolve;
    if (prior) Module._extensions['.ts'] = prior; else delete Module._extensions['.ts']; };
  try {
    const guard = require(path.join(SRC, 'lib/local-qa-intent-environment.ts'));
    guard.localQaIntentEnvironment();
    const admin = require(path.join(SRC, 'lib/firebase-admin.ts'));
    const settlement = require(path.join(SRC, 'lib/server/settle-checkout.ts'));
    return Object.freeze({ sourceCommit: sha, getAdminDb: admin.getAdminDb,
      settlePaidCheckoutSession: settlement.settlePaidCheckoutSession,
      close: async () => { try { await admin.getAdminDb().terminate(); } finally { restore(); } } });
  } catch (error) { restore(); throw error; }
}
module.exports = { loadNativeIntentSource };
