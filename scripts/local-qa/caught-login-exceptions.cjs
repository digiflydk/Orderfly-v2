'use strict';
// Chromium-only observation during submit/session. Never inspect frames, locals or values.
const DEADLINE_MS = 1000, MAX_PAUSES = 16;
function observerError() { return Object.assign(Error('QA0 login observer failed'), { name: 'QaObserverError' }); }
async function bounded(operation) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => { timer = setTimeout(() => reject(observerError()), DEADLINE_MS); })]); }
  finally { clearTimeout(timer); }
}
async function withCaughtLoginExceptions(page, diagnostic, role, action) {
  let session, failed = false, paused = false, closing = false, pauses = 0, notifyFailure;
  const failure = new Promise(resolve => { notifyFailure = resolve; });
  const fail = () => { failed = true; notifyFailure({ failed: true }); };
  const pending = new Set();
  const onPaused = event => {
    paused = true;
    const task = (async () => {
      try {
        if (++pauses > MAX_PAUSES || closing) fail();
        else if (event.reason === 'exception' || event.reason === 'promiseRejection') diagnostic.clientError(role, event.data?.description);
      } catch { fail(); }
      finally {
        try { await bounded(() => session.send('Debugger.resume')); paused = false; }
        catch { fail(); }
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
    await bounded(() => session.send('Debugger.enable'));
    await bounded(() => session.send('Debugger.setPauseOnExceptions', { state: 'all' }));
    actionStarted = true;
    const outcome = await Promise.race([Promise.resolve().then(action).then(value => ({ value })), failure]);
    if (outcome.failed) throw observerError();
    result = outcome.value;
  } catch (error) { actionError = error; if (!actionStarted) fail(); }
  finally {
    closing = true;
    if (session) {
      try { await bounded(() => session.send('Debugger.setPauseOnExceptions', { state: 'none' })); } catch { fail(); }
      try { await bounded(() => Promise.all([...pending])); } catch { fail(); }
      if (paused) { try { await bounded(() => session.send('Debugger.resume')); paused = false; } catch { fail(); } }
      try { await bounded(() => session.send('Debugger.disable')); } catch { fail(); }
      session.off('Debugger.paused', onPaused);
      try { await bounded(() => session.detach()); } catch { fail(); }
    }
  }
  if (failed || actionError?.name === 'QaObserverError') throw observerError();
  if (actionError) throw actionError;
  return result;
}
module.exports = { withCaughtLoginExceptions };
