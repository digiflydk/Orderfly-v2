'use strict';
const fs = require('node:fs'), path = require('node:path');
const { guardedContext } = require('./browser-boundary.cjs');
const BASE = 'http://127.0.0.1:3100';
function isPageScript(request) {
  try {
    const url = new URL(request.url());
    return !url.username && !url.password && url.origin === BASE && url.pathname.startsWith('/_next/') && url.pathname.endsWith('.js') && request.resourceType() === 'script';
  } catch { return false; }
}
async function cleanupBounded(operation) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => { timer = setTimeout(() => reject(Error('QA0 first-click cleanup deadline')), 1000); })]); }
  finally { clearTimeout(timer); }
}
async function installScriptGate(context) {
  let release, released = false, held = 0, failed = false;
  const pending = new Set(), gate = new Promise(resolve => { release = resolve; });
  const open = () => { released = true; release(); };
  // fallback preserves the existing HTTP frontier; the WebSocket guard is untouched.
  const handler = route => {
    const task = (async () => {
      try {
        if (!released && isPageScript(route.request())) { if (++held > 128) failed = true; await gate; }
        await route.fallback();
      } catch { failed = true; }
    })();
    pending.add(task); void task.finally(() => pending.delete(task));
    return task;
  };
  await context.route('**/*', handler);
  return { release: open, stop: open, heldCount: () => held, failed: () => failed,
    async drain() {
      // Remove ONLY this handler; preserve the original guard. Existing callbacks remain tracked.
      await context.unroute('**/*', handler);
      await Promise.all([...pending]);
      if (failed) throw Error('QA0 first-click gate drain failed');
    } };
}
async function runLoginFirstClickProof(browser, artifacts) {
  const proof = { environment: 'QA0-NextDEV-first-click', outcome: 'scenario-failed', devOnly: true,
    ssrControlVisible: false, gateEngaged: false, heldScripts: 0, enabledBeforeScripts: null,
    clickCount: 0, clickPhase: null, scriptsReleased: false, pageScriptsLoaded: false,
    scriptRuntimeFailed: false, modeChanged: false, cleanupVerified: false,
    productionAcceptance: false, physicalPrintVerified: false };
  let scope, gate, page, phase = 'setup', failed = true;
  try {
    scope = await guardedContext(browser, { width: 1348, height: 900 });
    gate = await installScriptGate(scope.context);
    page = await scope.context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', () => { proof.scriptRuntimeFailed = true; });
    page.on('requestfailed', request => { if (isPageScript(request)) proof.scriptRuntimeFailed = true; });
    page.on('response', response => { if (isPageScript(response.request()) && response.status() >= 400) proof.scriptRuntimeFailed = true; });
    phase = 'ssr';
    const response = await page.goto(BASE + '/admin-login', { waitUntil: 'commit' });
    if (response?.status() !== 200) throw Error('QA0 first-click page prerequisite failed');
    const toggle = page.getByRole('button', { name: 'Log ind med en separat Orderfly-konto', exact: true });
    await Promise.all([page.locator('form').waitFor({ state: 'visible' }), page.getByRole('heading', { name: 'ADMINISTRATION', exact: true }).waitFor({ state: 'visible' }), toggle.waitFor({ state: 'visible' })]);
    proof.ssrControlVisible = true;
    proof.heldScripts = gate.heldCount(); proof.gateEngaged = proof.heldScripts > 0;
    phase = 'gate';
    if (!proof.gateEngaged || gate.failed()) throw Error('QA0 first-click script prerequisite failed');
    proof.enabledBeforeScripts = await toggle.isEnabled();
    phase = 'first-click';
    if (proof.enabledBeforeScripts) {
      proof.clickCount++; proof.clickPhase = 'before-page-js';
      await toggle.click();
    }
    gate.release(); proof.scriptsReleased = true;
    phase = 'scripts';
    await page.waitForLoadState('load'); proof.pageScriptsLoaded = true;
    if (proof.scriptRuntimeFailed || gate.failed()) throw Error('QA0 first-click runtime prerequisite failed');
    if (!proof.enabledBeforeScripts) {
      proof.clickCount++; proof.clickPhase = 'after-page-js';
      await toggle.click();
    }
    phase = 'mode';
    await Promise.all([page.getByLabel('E-mail', { exact: true }).waitFor({ state: 'visible' }),
      page.getByLabel('Adgangskode', { exact: true }).waitFor({ state: 'visible' }),
      page.getByRole('button', { name: 'Log ind med Opsfly', exact: true }).waitFor({ state: 'visible' })]);
    if (proof.scriptRuntimeFailed || gate.failed() || proof.clickCount !== 1) throw Error('QA0 first-click runtime prerequisite failed');
    proof.modeChanged = true; proof.outcome = 'passed'; failed = false;
  } catch {
    if (phase === 'ssr') proof.outcome = 'missing-ssr-prerequisite';
    else if (phase === 'gate') proof.outcome = 'missing-script-gate-prerequisite';
    else if (proof.scriptRuntimeFailed || gate?.failed() || phase === 'scripts') proof.outcome = 'script-runtime-failed';
    else if (phase === 'mode' && proof.enabledBeforeScripts && proof.pageScriptsLoaded) proof.outcome = 'lost-first-enabled-click';
  } finally {
    let cleanupFailed = false;
    gate?.stop(); if (gate) { proof.scriptsReleased = true; proof.heldScripts = gate.heldCount(); }
    if (gate) { try { await cleanupBounded(() => gate.drain()); } catch { cleanupFailed = true; } }
    if (scope) { try { await cleanupBounded(() => scope.context.close()); } catch { cleanupFailed = true; } }
    proof.cleanupVerified = Boolean(scope) && !cleanupFailed;
    if (cleanupFailed) { proof.outcome = 'cleanup-failed'; failed = true; }
    fs.writeFileSync(path.join(artifacts, 'local-qa-first-click.json'), JSON.stringify(proof), { mode: 0o600 });
  }
  if (failed) throw Error('QA0 real first enabled login click proof failed');
  return proof;
}
module.exports = { isPageScript, installScriptGate, runLoginFirstClickProof };
