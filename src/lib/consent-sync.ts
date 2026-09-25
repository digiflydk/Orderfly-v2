import Cookies from 'js-cookie';
import { optionalGet, optionalSet, optionalRemove } from './optional-storage';
const pendingKey = 'pending_cookie_consent';
let queue = Promise.resolve();
let lastRevision = 0;
const revisionKey = 'orderfly_consent_revision';

function sendQueued(data: string) {
  queue = queue.catch(() => {}).then(async () => {
    if (optionalGet(pendingKey) !== data) return;
    try {
      const response = await fetch('/api/consent/save-anonymous',{method:'POST',headers:{'Content-Type':'application/json'},body:data,keepalive:true,signal:AbortSignal.timeout(5000)});
      if (!response.ok) return;
      const result = await response.json();
      if (typeof result.anon_user_id === 'string') {
        optionalSet('orderfly_anonymous_id',result.anon_user_id);
        try { Cookies.set('orderfly_anonymous_id',result.anon_user_id,{expires:365,path:'/',sameSite:'Lax'}); } catch { /* Server cookie is authoritative. */ }
      }
      // A later choice may have been queued while this request was in flight.
      if (optionalGet(pendingKey) === data) optionalRemove(pendingKey);
    } catch { /* The latest choice was queued before I/O and remains retryable. */ }
  });
  return queue;
}
export function saveConsentChoice(payload: Record<string, unknown>) {
  let previous = 0;
  try { previous = JSON.parse(optionalGet(pendingKey) || '{}').choice_revision || 0; } catch { /* Old malformed pending data. */ }
  const persisted = Number(optionalGet(revisionKey) || 0);
  lastRevision = Math.max(Date.now(),lastRevision+1,Number.isSafeInteger(previous) ? previous+1 : 0,Number.isSafeInteger(persisted) ? persisted+1 : 0);
  optionalSet(revisionKey,String(lastRevision));
  const data = JSON.stringify({...payload,choice_revision:lastRevision});
  optionalSet(pendingKey,data);
  return sendQueued(data);
}
export function retryPendingConsent() {
  const data = optionalGet(pendingKey);
  if (!data) return Promise.resolve();
  try { JSON.parse(data); } catch { return Promise.resolve(); }
  return sendQueued(data);
}
