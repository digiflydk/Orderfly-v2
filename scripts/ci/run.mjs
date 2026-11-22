#!/usr/bin/env node
// Local CI (#934). GitHub Actions only deploys; every test step runs here, in order,
// on the exact commit Work is about to merge. Nothing is skipped silently: the run
// stops at the first failure and the summary names the commit and every step.
//
//   npm run ci                 all steps
//   npm run ci -- --list       print the steps
//   npm run ci -- --from 12    start at step 12 (e.g. after fixing a failure)
//   npm run ci -- --only qr    only steps whose name contains "qr"
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { STEPS } from './steps.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const args = process.argv.slice(2);
const option = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined; };
const sh = (cmd, env = process.env) => spawnSync('bash', ['-eo', 'pipefail', '-c', cmd], { cwd: root, stdio: 'inherit', env });
const git = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } };

if (args.includes('--list')) { STEPS.forEach((s, i) => console.log(`${String(i + 1).padStart(2)} ${s.name} [${s.source}]`)); process.exit(0); }

const head = git('rev-parse', 'HEAD'), dirty = git('status', '--porcelain', '--untracked-files=no');
const from = Number(option('--from') || 1), only = option('--only');
const selected = STEPS.map((step, i) => ({ ...step, n: i + 1 }))
  .filter(step => step.n >= from && (!only || step.name.toLowerCase().includes(only.toLowerCase())));
if (!selected.length) { console.error('No steps selected.'); process.exit(2); }

const env = { ...process.env, CI: 'true', PLAYWRIGHT_BASE_URL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000' };
// As the former workflow did: the project's own Playwright Chromium, installed before any browser test.
// The isolated emulator proofs start browsers with a minimal environment, so they look in Playwright's
// default cache; install there too when this machine points PLAYWRIGHT_BROWSERS_PATH elsewhere.
const installBrowsers = env.PLAYWRIGHT_BROWSERS_PATH
  ? 'npx playwright install chromium && env -u PLAYWRIGHT_BROWSERS_PATH npx playwright install chromium'
  : 'npx playwright install chromium';
if (!args.includes('--list') && sh(installBrowsers, env).status !== 0) {
  console.error('Could not install the Playwright Chromium for this project version (network access to cdn.playwright.dev is needed once).');
  process.exit(1);
}

// The isolated Firestore emulator proofs need the pinned firebase-tools and Java 21, as in the former workflow.
function provisionQaTools() {
  const dir = path.join(root, '.cache/orderfly-qa0-tools'), bin = path.join(dir, 'node_modules/.bin/firebase');
  if (!existsSync(bin)) {
    mkdirSync(dir, { recursive: true });
    if (sh(`npm install --prefix "${dir}" --no-audit --no-fund firebase-tools@15.30.0`).status !== 0) throw new Error('Could not install firebase-tools@15.30.0');
  }
  const java = execFileSync('bash', ['-c', 'command -v java'], { encoding: 'utf8' }).trim();
  const version = spawnSync(java, ['-version'], { encoding: 'utf8' }).stderr || '';
  if (!/version "21/.test(version)) throw new Error(`Java 21 is required for the emulator proofs (found: ${version.split('\n')[0] || 'none'}).`);
  // As the former QR workflow did: the native QR proof needs the project's Chromium as an explicit path.
  const chromium = env.CART_CHROMIUM_PATH || execFileSync(process.execPath, ['-p', 'require("@playwright/test").chromium.executablePath()'], { cwd: root, encoding: 'utf8' }).trim();
  const qaEnv = { ...env, CART_CHROMIUM_PATH: chromium, QA0_FIREBASE_BIN: bin, QA0_JAVA_BIN: java, FIREBASE_CLI_DISABLE_UPDATE_CHECK: 'true', FIREBASE_CLI_DISABLE_USAGE_REPORTING: 'true' };
  if (sh(`"${bin}" setup:emulators:firestore`, qaEnv).status !== 0) throw new Error('Could not set up the Firestore emulator');
  return qaEnv;
}

let qaEnv = null;
const results = [], started = Date.now();
for (const step of selected) {
  const t0 = Date.now();
  console.log(`\n=== [${step.n}/${STEPS.length}] ${step.name} (${step.source})`);
  let status;
  try {
    if (step.needs.includes('qa-tools')) qaEnv ??= provisionQaTools();
    status = sh(step.run, step.needs.includes('qa-tools') ? qaEnv : env).status;
  } catch (error) { console.error(error.message); status = 1; }
  results.push({ n: step.n, name: step.name, ok: status === 0, seconds: Math.round((Date.now() - t0) / 1000) });
  if (status !== 0) break;
}

const failed = results.find(r => !r.ok), complete = !failed && from === 1 && !only;
const summary = [
  `### Local CI (\`npm run ci\`) — ${failed ? 'FAILED' : complete ? 'PASSED' : 'PASSED (partial run)'}`,
  `Commit \`${head}\`${dirty ? ' **with uncommitted changes**' : ''} · ${results.filter(r => r.ok).length}/${STEPS.length} steps passed · ${Math.round((Date.now() - started) / 60000)} min`,
  '', '| # | Step | Result | s |', '|---|---|---|---|',
  ...results.map(r => `| ${r.n} | ${r.name} | ${r.ok ? 'pass' : '**FAIL**'} | ${r.seconds} |`),
].join('\n');
console.log('\n' + summary);
mkdirSync(path.join(root, '.cache'), { recursive: true });
writeFileSync(path.join(root, '.cache/ci-summary.md'), summary + '\n');
process.exit(failed ? 1 : 0);
