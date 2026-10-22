'use strict';
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path'), fs = require('node:fs'), net = require('node:net');
const { environment } = require('./environment.cjs');
const root = path.resolve(__dirname, '../..'), env = environment();
const children = [], logs = [];
const privateDir = fs.mkdtempSync('/tmp/orderfly-qa0-'); fs.chmodSync(privateDir, 0o700);
async function ready(url, child) { const until = Date.now() + 90000;
  while (Date.now() < until) {
    if (child.exitCode !== null) throw Error('QA0 child exited before readiness');
    try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (r.status < 500) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw Error('QA0 readiness timed out');
}
function launch(command, args, childEnv, label, cwd = root) {
  const log = path.join(privateDir, `${label}.log`); const fd = fs.openSync(log, 'wx', 0o600); logs.push(log);
  const child = spawn(command, args, { cwd, env: childEnv, stdio: ['ignore', fd, fd], detached: true }); fs.closeSync(fd); children.push(child); return child;
}
(async () => {
  const firebase = process.env.QA0_FIREBASE_BIN, java = process.env.QA0_JAVA_BIN;
  if (!firebase || !java || !path.isAbsolute(firebase) || !path.isAbsolute(java) || !fs.existsSync(firebase) || !fs.existsSync(java)) throw Error('Provide explicit installed Firebase15.30 and Java21 binary paths');
  if (process.env.QA0_BROWSER_PROOF !== undefined && process.env.QA0_BROWSER_PROOF !== 'true') throw Error('QA0 browser proof mode rejected');
  const browserProof = process.env.QA0_BROWSER_PROOF === 'true';
  if (browserProof) {
    const { chromium } = require('playwright');
    if (!fs.existsSync(chromium.executablePath())) throw Error('QA0 official Chromium1234 binary is unavailable');
    env.ORDERFLY_LOCAL_QA_BROWSER = 'true';
  }
  if (process.env.QA0_CREDENTIAL_METADATA_PROOF !== undefined && process.env.QA0_CREDENTIAL_METADATA_PROOF !== 'true') throw Error('QA0 metadata proof mode rejected');
  if (process.env.QA0_CREDENTIAL_METADATA_PROOF === 'true') {
    env.QA0_CREDENTIAL_METADATA_PROOF = 'true';
    env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = 'false';
  }
  // Next loads dotenv files independently of child env. Refuse them without reading secrets.
  for (const name of ['.env', '.env.local', '.env.development', '.env.development.local']) if (fs.existsSync(path.join(root, name))) throw Error('QA0 requires a checkout without dotenv files');
  const toolsEnv = { PATH: path.dirname(java) + path.delimiter + env.PATH, LANG: env.LANG, TZ: env.TZ, CI: 'true', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true', FIREBASE_CLI_DISABLE_USAGE_REPORTING: 'true' };
  const cliVersion = spawnSync(firebase, ['--version'], { env: toolsEnv, encoding: 'utf8' });
  const javaVersion = spawnSync(java, ['-version'], { env: toolsEnv, encoding: 'utf8' });
  if (cliVersion.status !== 0 || cliVersion.stdout.trim() !== '15.30.0' || javaVersion.status !== 0 || !/version "21\./.test(javaVersion.stderr)) throw Error('QA0 requires Firebase CLI15.30.0 and Java21');
  for (const port of [3100,8088,9099,4400,4500,9150]) await new Promise((resolve,reject) => { const probe=net.createServer(); probe.once('error',()=>reject(Error('QA0 requires unused loopback ports'))); probe.listen(port,'127.0.0.1',()=>probe.close(resolve)); });
  const emulatorEnv = { PATH: path.dirname(java) + path.delimiter + env.PATH, LANG: env.LANG, TZ: env.TZ, CI: 'true',
    FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true', FIREBASE_CLI_DISABLE_USAGE_REPORTING: 'true' };
  const emulator = launch(firebase, ['emulators:start', '--project', 'demo-orderfly-qa0', '--only', 'auth,firestore', '--config', path.join(root, 'tests/local-qa/firebase.json')], emulatorEnv, 'emulators', privateDir);
  await ready('http://127.0.0.1:9099/emulator/v1/projects/demo-orderfly-qa0/config', emulator);
  await ready('http://127.0.0.1:8088/', emulator);
  const app = launch(process.execPath, [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '-p', '3100', '-H', '127.0.0.1'], env, 'app');
  await ready('http://127.0.0.1:3100/api/health', app);
  const summaries = [];
  // Keep the SAME emulator and app alive: a second seed must observe any leak.
  for (let pass = 0; pass < 2; pass++) {
    const smoke = spawn(process.execPath, [path.join(__dirname, 'backend-smoke.cjs')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: browserProof }); children.push(smoke);
    let summary = ''; smoke.stdout.on('data', chunk => summary += chunk); smoke.stderr.on('data', () => {});
    const code = await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        reject(Error('QA0 backend proof timed out'));
        if (browserProof) { try { process.kill(-smoke.pid, 'SIGKILL'); } catch { smoke.kill('SIGKILL'); } }
        else smoke.kill('SIGKILL');
      }, 60000);
      smoke.once('error', () => { clearTimeout(deadline); reject(Error('QA0 backend proof failed')); });
      smoke.once('exit', code => { clearTimeout(deadline); resolve(code); });
    });
    if (code !== 0) throw Error('QA0 backend proof failed');
    summaries.push(JSON.parse(summary));
  }
  const summary = { ...summaries[1], sameEmulatorPasses: summaries.length };
  if (browserProof) {
    const source = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, env: toolsEnv, encoding: 'utf8' });
    if (source.status !== 0 || !/^[0-9a-f]{40}$/.test(source.stdout.trim())) throw Error('QA0 source version unavailable');
    summary.environment = 'QA0b2-local-browser'; summary.source = source.stdout.trim();
    summary.nextVersion = require('next/package.json').version; summary.playwrightVersion = require('playwright/package.json').version;
    const artifacts = path.join(root, 'test-results'); fs.mkdirSync(artifacts, { recursive: true });
    fs.writeFileSync(path.join(artifacts, 'local-qa-summary.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  }
  console.log(JSON.stringify(summary));
})().catch(error => { console.error(error.message); console.error('Protected local process logs:', logs.join(', ')); process.exitCode = 1; }).finally(async () => {
  for (const child of children.reverse()) if (child.exitCode === null) { try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); } }
});
