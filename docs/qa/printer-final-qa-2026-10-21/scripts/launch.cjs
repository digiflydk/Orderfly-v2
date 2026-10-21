'use strict';
// Same launch sequence as scripts/local-qa/run-backend.cjs, but runs driver.cjs once.
const ROOT = '/home/user/Orderfly-v2';
const { spawn } = require('node:child_process');
const path = require('node:path'), fs = require('node:fs');
const { environment } = require(ROOT + '/scripts/local-qa/environment.cjs');
const env = environment(), children = [];
if (process.env.QA_WRITES === 'false') env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = 'false';
env.QA_WRITES = env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED;
const privateDir = fs.mkdtempSync('/tmp/claude-0/-home-user-Orderfly-v2/a92a8919-9ee2-5732-b9b4-d3192a2515b7/scratchpad/qa/logs-');
async function ready(url, child) { const until = Date.now() + 120000;
  while (Date.now() < until) { if (child.exitCode !== null) throw Error('child exited');
    try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (r.status < 500) return; } catch {}
    await new Promise(r => setTimeout(r, 400)); } throw Error('readiness timeout'); }
function launch(cmd, args, e, label, cwd = ROOT) { const fd = fs.openSync(path.join(privateDir, label + '.log'), 'wx', 0o600);
  const c = spawn(cmd, args, { cwd, env: e, stdio: ['ignore', fd, fd], detached: true }); fs.closeSync(fd); children.push(c); return c; }
(async () => {
  const firebase = process.env.QA0_FIREBASE_BIN, java = process.env.QA0_JAVA_BIN;
  for (const n of ['.env', '.env.local', '.env.development', '.env.development.local']) if (fs.existsSync(path.join(ROOT, n))) throw Error('dotenv present');
  const emuEnv = { PATH: path.dirname(java) + path.delimiter + env.PATH, LANG: env.LANG, TZ: env.TZ, CI: 'true', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true', FIREBASE_CLI_DISABLE_USAGE_REPORTING: 'true' };
  const emu = launch(firebase, ['emulators:start', '--project', 'demo-orderfly-qa0', '--only', 'auth,firestore', '--config', path.join(ROOT, 'tests/local-qa/firebase.json')], emuEnv, 'emulators', privateDir);
  await ready('http://127.0.0.1:9099/emulator/v1/projects/demo-orderfly-qa0/config', emu); await ready('http://127.0.0.1:8088/', emu);
  const app = launch(process.execPath, [path.join(ROOT, 'node_modules/next/dist/bin/next'), 'dev', '-p', '3100', '-H', '127.0.0.1'], env, 'app');
  await ready('http://127.0.0.1:3100/api/health', app);
  const health = await (await fetch('http://127.0.0.1:3100/api/health')).text();
  console.error('local health: ' + health);
  const d = spawn(process.execPath, [path.join(__dirname, process.argv[2] || 'driver.cjs')], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] }); children.push(d);
  let out = '', err = ''; d.stdout.on('data', c => out += c); d.stderr.on('data', c => err += c);
  const code = await new Promise(r => d.once('exit', r));
  fs.writeFileSync(path.join(__dirname, (process.argv[2] || 'driver.cjs').replace('.cjs','') + '-' + env.QA_WRITES + '-result.json'), out);
  if (err) fs.writeFileSync(path.join(privateDir, 'driver-stderr.log'), err);
  console.error('driver exit', code);
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => {
  for (const c of children.reverse()) if (c.exitCode === null) { try { process.kill(-c.pid, 'SIGTERM'); } catch { c.kill('SIGTERM'); } } });
