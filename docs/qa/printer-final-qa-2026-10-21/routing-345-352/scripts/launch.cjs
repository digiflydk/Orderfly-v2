'use strict';
// Scratch QA launcher (evidence only, not a replacement for scripts/local-qa/run-backend.cjs).
// Mirrors its safety preflight: pinned Firebase CLI 15.30.0 + Java 21, dotenv refusal, unused
// loopback ports, sanitized child env from scripts/local-qa/environment.cjs, loopback network
// guard. Adds the observation-only transaction observer to the app process, a bounded driver
// deadline, and process-group termination WITH wait-for-exit.
const ROOT = '/home/user/Orderfly-v2';
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path'), fs = require('node:fs'), net = require('node:net');
const { environment } = require(ROOT + '/scripts/local-qa/environment.cjs');
const DRIVERS = { 'qa3b.cjs': 1500000, 'browser3.cjs': 600000, 'probe.cjs': 120000, 'routing.cjs': 900000, 'routing-ui.cjs': 900000 };
const driverName = process.argv[2];
if (!Object.hasOwn(DRIVERS, driverName)) throw Error('unknown driver');
const env = environment(), children = [];
if (process.env.QA_WRITES === 'false') env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED = 'false';
const privateDir = fs.mkdtempSync(path.join(__dirname, 'run-')); fs.chmodSync(privateDir, 0o700);
const observerDir = path.join(privateDir, 'observer'); fs.mkdirSync(observerDir, { mode: 0o700 });
const appEnv = { ...env, QA_OBSERVER_DIR: observerDir, NODE_OPTIONS: process.env.QA_NO_OBSERVER ? env.NODE_OPTIONS : `--require=${path.join(__dirname, 'observer.cjs')}` };
const driverEnv = { ...env, QA_OBSERVER_DIR: observerDir };
async function ready(url, child) { const until = Date.now() + 120000;
  while (Date.now() < until) { if (child.exitCode !== null) throw Error('child exited before readiness');
    try { const r = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (r.status < 500) return; } catch {}
    await new Promise(r => setTimeout(r, 400)); } throw Error('readiness timeout'); }
function launch(cmd, args, e, label, cwd = ROOT) { const fd = fs.openSync(path.join(privateDir, label + '.log'), 'wx', 0o600);
  const c = spawn(cmd, args, { cwd, env: e, stdio: ['ignore', fd, fd], detached: true }); fs.closeSync(fd); children.push(c); return c; }
async function stopAll() {
  for (const c of [...children].reverse()) if (c.exitCode === null && c.signalCode === null) { try { process.kill(-c.pid, 'SIGTERM'); } catch { try { c.kill('SIGTERM'); } catch {} } }
  const until = Date.now() + 20000;
  while (children.some(c => c.exitCode === null && c.signalCode === null) && Date.now() < until) await new Promise(r => setTimeout(r, 200));
  for (const c of children) if (c.exitCode === null && c.signalCode === null) { try { process.kill(-c.pid, 'SIGKILL'); } catch {} }
}
(async () => {
  const firebase = process.env.QA0_FIREBASE_BIN, java = process.env.QA0_JAVA_BIN;
  if (!firebase || !java || !path.isAbsolute(firebase) || !path.isAbsolute(java)) throw Error('explicit Firebase/Java paths required');
  for (const n of ['.env', '.env.local', '.env.development', '.env.development.local']) if (fs.existsSync(path.join(ROOT, n))) throw Error('dotenv present');
  const toolsEnv = { PATH: path.dirname(java) + path.delimiter + env.PATH, LANG: env.LANG, TZ: env.TZ, CI: 'true', FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true', FIREBASE_CLI_DISABLE_USAGE_REPORTING: 'true' };
  const cli = spawnSync(firebase, ['--version'], { env: toolsEnv, encoding: 'utf8' }), jv = spawnSync(java, ['-version'], { env: toolsEnv, encoding: 'utf8' });
  if (cli.stdout.trim() !== '15.30.0' || !/version "21\./.test(jv.stderr)) throw Error('requires Firebase CLI 15.30.0 and Java 21');
  for (const port of [3100, 8088, 9099, 4400, 4500, 9150]) await new Promise((res, rej) => { const p = net.createServer(); p.once('error', () => rej(Error('port in use ' + port))); p.listen(port, '127.0.0.1', () => p.close(res)); });
  const emu = launch(firebase, ['emulators:start', '--project', 'demo-orderfly-qa0', '--only', 'auth,firestore', '--config', path.join(ROOT, 'tests/local-qa/firebase.json')], toolsEnv, 'emulators', privateDir);
  await ready('http://127.0.0.1:9099/emulator/v1/projects/demo-orderfly-qa0/config', emu); await ready('http://127.0.0.1:8088/', emu);
  const app = launch(process.execPath, [path.join(ROOT, 'node_modules/next/dist/bin/next'), 'dev', '-p', '3100', '-H', '127.0.0.1'], appEnv, 'app');
  await ready('http://127.0.0.1:3100/api/health', app);
  const health = JSON.parse(await (await fetch('http://127.0.0.1:3100/api/health')).text());
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  const appDiff = spawnSync('git', ['diff', '--stat', 'origin/main', 'HEAD', '--', 'src', 'scripts', 'tests', 'package.json', 'package-lock.json', 'next.config.js'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  const d = spawn(process.execPath, [path.join(__dirname, driverName)], { cwd: ROOT, env: driverEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true }); children.push(d);
  let out = '', err = ''; d.stdout.on('data', c => out += c); d.stderr.on('data', c => err += c);
  const code = await new Promise(r => { const t = setTimeout(() => { try { process.kill(-d.pid, 'SIGKILL'); } catch {} r('deadline'); }, DRIVERS[driverName]); d.once('exit', c => { clearTimeout(t); r(c); }); });
  const observerLoaded = fs.existsSync(path.join(observerDir, 'observer-loaded'));
  let result; try { result = JSON.parse(out); } catch { result = { fatal: 'unparsable driver output' }; }
  fs.writeFileSync(path.join(__dirname, driverName.replace('.cjs', '') + (env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED === 'false' ? '-writesoff' : '') + '-result.json'), JSON.stringify({ appHealthRelease: health.release, repoHead: git,
    appSourceDiffVsOriginMain: appDiff || 'none', observerLoaded, driverExit: code, ...result }, null, 1));
  if (err) fs.writeFileSync(path.join(privateDir, 'driver-stderr.log'), err);
  console.error('driver exit', code, 'observer', observerLoaded);
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(stopAll);
