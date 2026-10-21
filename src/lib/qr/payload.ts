/** Pure QR payload policy. Never fetch a destination or resolve its DNS here. */
export const MAX_QR_PAYLOAD_BYTES = 2000;

export class QrPayloadError extends Error {
  constructor(public readonly code: 'invalid_input' | 'invalid_url' | 'blocked_destination' | 'payload_too_large', public readonly field: string) {
    super(`${code}: ${field}`);
    this.name = 'QrPayloadError';
  }
}

export type DestinationOptions = { blockedOrigins?: readonly string[] };
export type UtmTags = Partial<Record<'source' | 'medium' | 'campaign' | 'term' | 'content', string>>;
export type QrStaticInput =
  | { type: 'url'; url: string; utm?: UtmTags }
  | { type: 'text'; text: string }
  | { type: 'wifi'; ssid: string; password?: string; security: 'WPA' | 'WEP' | 'nopass'; hidden?: boolean }
  | { type: 'vcard'; firstName: string; lastName: string; organization?: string; phone?: string; email?: string; url?: string }
  | { type: 'email'; to: string; subject?: string; body?: string }
  | { type: 'phone'; phone: string }
  | { type: 'sms'; phone: string; body?: string };

function text(value: unknown, field: string, max: number, allowLines = false, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    || (!allowLines && /[\r\n]/.test(value))) throw new QrPayloadError('invalid_input', field);
  return value;
}
function bounded(value: string): string {
  if (new TextEncoder().encode(value).length > MAX_QR_PAYLOAD_BYTES) throw new QrPayloadError('payload_too_large', 'payload');
  return value;
}
function blockedHost(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h === 'localhost' || !h.includes('.') || /\.(localhost|local|internal|lan|home|test|invalid|example)$/.test(h)) return true;
  // Every IPv6 literal is excluded, including IPv4-mapped and zone-address forms.
  if (h.startsWith('[') || h.includes(':')) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a,b] = h.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0))
      || (a === 198 && (b === 18 || b === 19));
  }
  return false;
}

export function normalizeDestination(input: string, options: DestinationOptions = {}): string {
  text(input, 'url', MAX_QR_PAYLOAD_BYTES);
  // Reject ambiguous controls, whitespace and backslash normalization, rather than silently fixing them.
  if (/[\s\\]/u.test(input)) throw new QrPayloadError('invalid_url', 'url');
  let url: URL;
  try { url = new URL(input); } catch { throw new QrPayloadError('invalid_url', 'url'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new QrPayloadError('invalid_url', 'url');
  if (blockedHost(url.hostname)) throw new QrPayloadError('blocked_destination', 'url');
  const own = url.hostname === 'orderfly.dk' || url.hostname.endsWith('.orderfly.dk')
    || (options.blockedOrigins ?? []).some(origin => { try { return new URL(origin).origin === url.origin; } catch { return false; } });
  let path: string;
  try { path = decodeURIComponent(url.pathname); } catch { throw new QrPayloadError('invalid_url', 'url'); }
  if (own && /^\/+q(?:\/|$)/i.test(path)) throw new QrPayloadError('blocked_destination', 'url');
  return bounded(url.toString());
}

export function applyUtm(destination: string, tags: UtmTags = {}, options: DestinationOptions = {}): string {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) throw new QrPayloadError('invalid_input', 'utm');
  const url = new URL(normalizeDestination(destination, options));
  for (const key of Object.keys(tags)) {
    if (!['source', 'medium', 'campaign', 'term', 'content'].includes(key)) throw new QrPayloadError('invalid_input', 'utm');
    const value = tags[key as keyof UtmTags];
    if (value !== undefined) url.searchParams.set(`utm_${key}`, text(value, `utm.${key}`, 200));
  }
  return bounded(url.toString());
}

function optional(value: unknown, field: string, max = 200, allowLines = false): string {
  return value === undefined ? '' : text(value, field, max, allowLines, true);
}
function phone(value: unknown): string {
  const p = text(value, 'phone', 40).trim();
  if (!/^\+?[0-9][0-9 ()-]{2,30}$/.test(p) || p.replace(/\D/g, '').length > 15) throw new QrPayloadError('invalid_input', 'phone');
  return p.replace(/[ ()-]/g, '');
}
function email(value: unknown): string {
  const e = text(value, 'email', 254);
  if (!/^[A-Za-z0-9.!#$%&'*+\/=^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(e)
    || e.includes('..')) throw new QrPayloadError('invalid_input', 'email');
  return e;
}
const escapeWifi = (s: string) => s.replace(/[\\;,:\"]/g, '\\$&');
const escapeCard = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/[,;]/g, '\\$&');

export function buildStaticPayload(input: QrStaticInput, options: DestinationOptions = {}): string {
  if (!input || typeof input !== 'object') throw new QrPayloadError('invalid_input', 'payload');
  let result: string;
  switch (input.type) {
    case 'url': return applyUtm(input.url, input.utm, options);
    case 'text': result = text(input.text, 'text', MAX_QR_PAYLOAD_BYTES, true); break;
    case 'wifi': {
      const ssid = text(input.ssid, 'ssid', 32);
      if (new TextEncoder().encode(ssid).length > 32 || !['WPA','WEP','nopass'].includes(input.security)
        || (input.hidden !== undefined && typeof input.hidden !== 'boolean')) throw new QrPayloadError('invalid_input', 'wifi');
      const password = optional(input.password, 'password', 128);
      if ((input.security === 'nopass' && password) || (input.security !== 'nopass' && !password)) throw new QrPayloadError('invalid_input', 'password');
      result = `WIFI:T:${input.security};S:${escapeWifi(ssid)};P:${escapeWifi(password)};H:${input.hidden === true ? 'true' : 'false'};;`; break;
    }
    case 'vcard': {
      const first = text(input.firstName, 'firstName', 100, false, true), last = text(input.lastName, 'lastName', 100, false, true);
      if (!first.trim() && !last.trim()) throw new QrPayloadError('invalid_input', 'name');
      const lines = ['BEGIN:VCARD','VERSION:3.0',`N:${escapeCard(last)};${escapeCard(first)};;;`,`FN:${escapeCard(`${first} ${last}`.trim())}`];
      if (input.organization) lines.push(`ORG:${escapeCard(text(input.organization, 'organization', 200))}`);
      if (input.phone) lines.push(`TEL:${phone(input.phone)}`);
      if (input.email) lines.push(`EMAIL:${email(input.email)}`);
      if (input.url) lines.push(`URL:${normalizeDestination(input.url, options)}`);
      result = [...lines,'END:VCARD'].join('\r\n'); break;
    }
    case 'email': {
      const params = new URLSearchParams();
      if (input.subject !== undefined) params.set('subject', optional(input.subject, 'subject', 200));
      if (input.body !== undefined) params.set('body', optional(input.body, 'body', 1500, true));
      const query = params.toString();
      result = `mailto:${encodeURIComponent(email(input.to)).replace(/%40/g, '@')}${query ? `?${query}` : ''}`; break;
    }
    case 'phone': result = `tel:${phone(input.phone)}`; break;
    case 'sms': result = `sms:${phone(input.phone)}${input.body === undefined ? '' : `?body=${encodeURIComponent(optional(input.body, 'body', 1500, true))}`}`; break;
    default: throw new QrPayloadError('invalid_input', 'type');
  }
  return bounded(result);
}
