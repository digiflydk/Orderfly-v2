import 'server-only';

type Credentials = { merchantNumber: string; accessToken: string; secretToken: string };
export type WorldlineDiagnosticCategory = 'SESSION_STATE' | 'ACCESS_DENIED' | 'SESSION_NOT_FOUND' | 'SESSION_EXPIRED' | 'UNCLASSIFIED';
const sources: Record<string, string> = {
  BEC: 'BEC', ePayWebservice: 'EPAYWEBSERVICE', ePayGeneral: 'EPAYGENERAL', System: 'SYSTEM',
};
const actionTypes = new Set(['success', 'generalerror', 'validationerror', 'systemerror', 'acquirererror']);
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const boundedSource = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 32 && !/[^A-Za-z0-9]/.test(value);
const boundedCode = (value: unknown): string | undefined =>
  (typeof value === 'string' || typeof value === 'number') && String(value).length > 0 && String(value).length <= 6 && !/[^0-9]/.test(String(value)) ? String(value) : undefined;

function action(body: unknown) {
  const value = record(record(record(body)?.meta)?.action);
  const code = boundedCode(value?.code), source = boundedSource(value?.source) ? value.source : undefined;
  const type = typeof value?.type === 'string' && actionTypes.has(value.type) ? value.type : undefined;
  return { code, source, type };
}

/** Only static known source names can reach a support code. Other source values
 * may identify a catalog record, but are never returned or persisted. */
export function extractWorldlineActionDiagnostics(body: unknown): { code?: string; source?: string; type?: string } {
  const value = action(body);
  return { code: value.code, source: value.source && Object.hasOwn(sources, value.source) ? sources[value.source] : undefined, type: value.type };
}

/** Diagnostic grouping only: none of these categories proves expiry, lack of
 * authorization, payment, or permission to release an order's reservation. */
export function classifyWorldlineCatalogResponse(body: unknown, source: string, code: string): WorldlineDiagnosticCategory {
  const root = record(body), entry = record(root?.responsecode);
  if (record(root?.meta)?.result !== true || !entry || entry.source !== source || entry.actioncode !== code) return 'UNCLASSIFIED';
  const labels = [entry.merchantlabel, entry.enduserlabel];
  if (labels.some(label => typeof label !== 'string' || label.length > 512)) return 'UNCLASSIFIED';
  const label = (labels as string[]).join(' ').toLowerCase();
  if (/\b(access denied|permission denied|not authorized|not authorised|unauthorized|unauthorised|forbidden|no access|insufficient permissions)\b/.test(label)) return 'ACCESS_DENIED';
  if (/\bsession\b/.test(label)) {
    if (/\b(not found|does not exist|cannot be found|unknown session)\b/.test(label)) return 'SESSION_NOT_FOUND';
    if (/\b(expire|expired|expiry|expiration)\b/.test(label)) {
      // Refusal to expire a session is different from a positive description of
      // its current state. These categories remain diagnostic hints only.
      const negated = /\b(cannot|can't|could not|can not|not|unable to|failed to)\b.{0,48}\b(expire|expired|expiry|expiration)\b|\b(expire|expiry|expiration)\b.{0,48}\b(failed|denied|not allowed)\b/.test(label);
      const positive = /\bsession(?: token)? (?:has already |is already |was already |has |is |was |already )?expired\b/.test(label);
      return positive && !negated ? 'SESSION_EXPIRED' : 'SESSION_STATE';
    }
    if (/\b(state|status|already closed|not active|inactive)\b/.test(label)) return 'SESSION_STATE';
  }
  return 'UNCLASSIFIED';
}

async function catalogCategory(credentials: Credentials, source: string, code: string): Promise<WorldlineDiagnosticCategory> {
  // The original agreement supplies all auth fields. This endpoint is read-only;
  // no session/transaction token is sent and redirects are forbidden.
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<WorldlineDiagnosticCategory>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve('UNCLASSIFIED'); }, 2000);
    });
    const lookup = (async () => {
      const response = await fetch(`https://data-v1.api-eu.bambora.com/responsecodes/${encodeURIComponent(source)}/${code}`, {
        method: 'GET', redirect: 'error', cache: 'no-store', signal: controller.signal,
        headers: { Authorization: `Basic ${Buffer.from(`${credentials.accessToken}@${credentials.merchantNumber}:${credentials.secretToken}`).toString('base64')}`, Accept: 'application/json' },
      });
      if (!response.ok) return 'UNCLASSIFIED' as const;
      return classifyWorldlineCatalogResponse(await response.json(), source, code);
    })().catch(() => 'UNCLASSIFIED' as const);
    return await Promise.race([lookup, deadline]);
  } catch {
    return 'UNCLASSIFIED';
  } finally {
    clearTimeout(timer);
  }
}

/** A redacted support-code suffix. Errors or catalog changes never change the
 * cancellation outcome, and no provider message/label leaves this module. */
export async function worldlineExpiryDiagnostic(credentials: Credentials, body: unknown): Promise<string> {
  let fallback = '';
  try {
    const value = action(body);
    if (!value.code) return fallback;
    fallback = `_PROVIDER_${value.code}`;
    const knownSource = value.source && Object.hasOwn(sources, value.source) ? sources[value.source] : undefined;
    const category = value.source ? await catalogCategory(credentials, value.source, value.code) : 'UNCLASSIFIED';
    return fallback + (knownSource ? `_SRC_${knownSource}` : '') + (category !== 'UNCLASSIFIED' ? `_REASON_${category}` : '');
  } catch {
    return fallback;
  }
}
