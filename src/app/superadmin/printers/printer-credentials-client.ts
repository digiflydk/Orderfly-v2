export type CredentialScope = Readonly<{ brandId: string; locationId: string; printerId: string; printerRevision: number }>;
export type CredentialMetadata = CredentialScope & Readonly<{ credentialRevision: number; state: 'missing' | 'current' | 'revoked' | 'stale' }>;
export type CredentialOperation = 'issue' | 'rotate' | 'revoke';
export type CredentialView = Readonly<{ phase: 'idle' | 'loading' | 'ready' | 'confirm' | 'writing' | 'secret' | 'error' | 'disposed';
  metadata: CredentialMetadata | null; operation: CredentialOperation | null; message: string; secret: string | null }>;
const endpoint = '/api/superadmin/printers/device-credentials';
const id = /^[A-Za-z0-9_-]{1,128}$/;
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const matches = (v: Record<string, unknown>, s: CredentialScope) => v.brandId === s.brandId && v.locationId === s.locationId
  && v.printerId === s.printerId && v.printerRevision === s.printerRevision;
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== keys.sort().join(',')) throw Error('invalid_response');
  return value as Record<string, unknown>;
}
async function body(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw Error('invalid_response');
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel().catch(() => {}); throw Error('invalid_response'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
function metadata(value: unknown, scope: CredentialScope): CredentialMetadata {
  const v = record(value, ['brandId', 'locationId', 'printerId', 'printerRevision', 'credentialRevision', 'state', 'dispatchAuthorized', 'activationAuthorized']);
  if (!matches(v, scope) || !Number.isSafeInteger(v.credentialRevision) || (v.credentialRevision as number) < 0
    || !['missing', 'current', 'revoked', 'stale'].includes(v.state as string)
    || (v.state === 'missing') !== (v.credentialRevision === 0) || v.dispatchAuthorized !== false || v.activationAuthorized !== false) throw Error('invalid_response');
  return Object.freeze({ ...scope, credentialRevision: v.credentialRevision as number, state: v.state as CredentialMetadata['state'] });
}
export function credentialOperationAllowed(data: CredentialMetadata, operation: CredentialOperation): boolean {
  return ['issue', 'rotate', 'revoke'].includes(operation) && data.credentialRevision < Number.MAX_SAFE_INTEGER && (operation === 'issue' ? data.state === 'missing'
    : operation === 'rotate' ? data.state !== 'missing' : data.state === 'current' || data.state === 'stale');
}

/** Browser-only, per-mounted-panel state. Server endpoints remain the authority. */
export function createCredentialController(scope: CredentialScope, permitted: boolean, sessionLost: () => void,
  fetcher: typeof fetch = (...args) => fetch(...args)) {
  scope = Object.freeze({ ...scope });
  const validScope = [scope.brandId, scope.locationId, scope.printerId].every(v => typeof v === 'string' && id.test(v)) && positive(scope.printerRevision);
  let disposed = false, request: AbortController | null = null;
  let state: CredentialView = Object.freeze({ phase: 'idle', metadata: null, operation: null, secret: null, message: '' });
  const listeners = new Set<() => void>();
  const update = (next: CredentialView) => { state = Object.freeze(next); for (const listener of listeners) listener(); };
  const failure = (message: string) => update({ phase: 'error', metadata: null, operation: null, secret: null, message });
  const current = (controller: AbortController) => !disposed && !controller.signal.aborted && request === controller;
  function dispose() {
    disposed = true; request?.abort(); request = null;
    state = Object.freeze({ phase: 'disposed', metadata: null, operation: null, secret: null, message: '' }); listeners.clear();
  }
  async function refresh() {
    if (disposed || request || state.phase === 'secret') return;
    if (!permitted || !validScope) { failure('Du har ikke adgang til printeradgang for denne række.'); return; }
    const controller = new AbortController(); request = controller;
    update({ phase: 'loading', metadata: null, operation: null, secret: null, message: '' });
    try {
      const query = new URLSearchParams({ brandId: scope.brandId, locationId: scope.locationId, printerId: scope.printerId });
      const response = await fetcher(endpoint + '?' + query, { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!current(controller)) return;
      if (response.status === 401) { failure('Din session er udløbet. Log ind igen.'); sessionLost(); return; }
      if (response.status !== 200) { failure(response.status === 403 ? 'Du har ikke adgang til printeradgangen.' : 'Printeradgangen kunne ikke indlæses. Opdater oversigten eller prøv igen.'); return; }
      const data = metadata(await body(response), scope);
      if (current(controller)) update({ phase: 'ready', metadata: data, operation: null, secret: null, message: '' });
    } catch { if (current(controller)) failure('Printeradgangen kunne ikke bekræftes. Opdater oversigten eller prøv igen.'); }
    finally { if (request === controller) request = null; }
  }
  function select(operation: CredentialOperation) {
    if (disposed || request || !permitted || state.phase !== 'ready' || !state.metadata || !credentialOperationAllowed(state.metadata, operation)) return;
    update({ ...state, phase: 'confirm', operation, secret: null, message: '' });
  }
  function cancel() {
    if (!disposed && !request && state.phase === 'confirm') update({ ...state, phase: 'ready', operation: null, message: '' });
  }
  async function confirm() {
    const data = state.metadata, operation = state.operation;
    if (disposed || request || !permitted || state.phase !== 'confirm' || !data || !operation || !credentialOperationAllowed(data, operation)) return;
    const controller = new AbortController(); request = controller;
    update({ phase: 'writing', metadata: data, operation, secret: null, message: '' });
    try {
      const response = await fetcher(endpoint, { method: 'POST', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...scope, operation, credentialRevision: data.credentialRevision }) });
      if (!current(controller)) return;
      if (response.status === 401) { failure('Din session er udløbet. Log ind igen.'); sessionLost(); return; }
      if (response.status !== (operation === 'issue' ? 201 : 200)) {
        let writesOff = false;
        if (response.status === 503) { try { const v = await body(response); writesOff = (v as { error?: unknown })?.error === 'writes_unavailable'; } catch { /* fixed message only */ } }
        if (!current(controller)) return;
        failure(writesOff ? 'Printerændringer er slået fra. Indlæs status før et nyt forsøg.' : response.status === 409
          ? 'Printeradgangen er ændret. Indlæs status og bekræft et nyt valg.' : response.status === 403 ? 'Du har ikke adgang til denne handling.'
            : 'Handlingen kunne ikke bekræftes. Indlæs status. En mistet kode kan kun erstattes med en ny rotation.'); return;
      }
      const revoked = operation === 'revoke';
      const v = record(await body(response), ['brandId', 'locationId', 'printerId', 'printerRevision', 'credentialRevision', 'revoked', 'dispatchAuthorized', 'activationAuthorized', ...(revoked ? [] : ['secret'])]);
      if (!matches(v, scope) || v.credentialRevision !== data.credentialRevision + 1 || v.revoked !== revoked
        || v.dispatchAuthorized !== false || v.activationAuthorized !== false
        || (!revoked && (typeof v.secret !== 'string' || !/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(v.secret)))) throw Error('invalid_response');
      if (current(controller)) update({ phase: revoked ? 'ready' : 'secret', metadata: Object.freeze({ ...scope, credentialRevision: v.credentialRevision as number,
        state: revoked ? 'revoked' : 'current' }), operation: null, secret: revoked ? null : v.secret as string,
        message: revoked ? 'Printeradgangen er tilbagekaldt.' : '' });
    } catch { if (current(controller)) failure('Handlingen kunne ikke bekræftes. Indlæs status. En mistet kode kan kun erstattes med en ny rotation.'); }
    finally { if (request === controller) request = null; }
  }
  return { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    refresh, select, cancel, confirm, dispose, activate: () => {
      // React's development StrictMode rehearses effect cleanup/setup. Start a
      // fresh empty lifetime; an aborted previous request cannot match this one.
      if (disposed) { disposed = false; update({ phase: 'idle', metadata: null, operation: null, secret: null, message: '' }); }
    }, dismissSecret: () => {
      if (!disposed && state.phase === 'secret') update({ ...state, phase: 'ready', secret: null, message: 'Koden er skjult. Den kan kun erstattes med en ny rotation.' });
    } };
}
