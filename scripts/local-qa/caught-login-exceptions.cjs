'use strict';
// Chromium-only observation during submit/session. Never inspect frames, locals or values.
const DEADLINE_MS = 1000, MAX_PAUSES = 16;
function observerError(operation = null) { return Object.assign(Error('QA0 login observer failed'), { name: 'QaObserverError', operation }); }
async function bounded(operation) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => { timer = setTimeout(() => reject(observerError()), DEADLINE_MS); })]); }
  finally { clearTimeout(timer); }
}
async function withCaughtLoginExceptions(page, diagnostic, role, action) {
  let session, failed = false, paused = false, closing = false, pauses = 0, notifyFailure, failureOperation = null, setupOperation = 'attach';
  const failure = new Promise(resolve => { notifyFailure = resolve; });
  const fail = operation => { failureOperation ??= operation; failed = true; notifyFailure({ failed: true }); };
  const pending = new Set();
  const onPaused = event => {
    paused = true;
    const task = (async () => {
      try {
        if (++pauses > MAX_PAUSES || closing) fail(closing ? 'closingPause' : 'pauseLimit');
        else if (event.reason === 'exception' || event.reason === 'promiseRejection') diagnostic.clientError(role, event.data?.description);
      } catch { fail('categorize'); }
      finally {
        try { await bounded(() => session.send('Debugger.resume')); paused = false; }
        catch { fail('resume'); }
      }
    })();
    pending.add(task); void task.finally(() => pending.delete(task));
  };
  let result, actionError, actionStarted = false;
  try {
    const attaching = page.context().newCDPSession(page);
    let abandoned = false;
    void attaching.then(late => { if (abandoned) void bounded(() => late.detach()).catch(() => {}); }, () => {});
    try { session = await bounded(() => attaching); } catch { abandoned = true; throw observerError(); }
    session.on('Debugger.paused', onPaused);
    setupOperation = 'enable';
    await bounded(() => session.send('Debugger.enable'));
    setupOperation = 'pauseMode';
    await bounded(() => session.send('Debugger.setPauseOnExceptions', { state: 'all' }));
    actionStarted = true;
    const outcome = await Promise.race([Promise.resolve().then(action).then(value => ({ value })), failure]);
    if (outcome.failed) throw observerError();
    result = outcome.value;
  } catch (error) { actionError = error; if (!actionStarted) fail(setupOperation); }
  finally {
    closing = true;
    if (session) {
      try { await bounded(() => Promise.all([...pending])); } catch { fail('settle'); }
      if (paused) { try { await bounded(() => session.send('Debugger.resume')); paused = false; } catch { fail('resume'); } }
      // After session200 the app navigates; renderer-bound Debugger commands then wait for
      // the next route (seconds in Next DEV). Detaching is browser-side, ends this client's
      // Debugger agent and pause-on-exceptions, and resumes any pause it owns.
      session.off('Debugger.paused', onPaused);
      try { await bounded(() => session.detach()); } catch { fail('detach'); }
    }
  }
  if (failed || actionError?.name === 'QaObserverError') throw observerError(failureOperation);
  if (actionError) throw actionError;
  return result;
}
module.exports = { withCaughtLoginExceptions };
