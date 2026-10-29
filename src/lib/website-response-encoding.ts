import { gzipSync } from 'node:zlib';

/** Encode immutable website text once; never transform images or unknown encodings. */
export function encodeWebsiteResponse(bytes: Buffer, headers: Headers, request: Request): Uint8Array<ArrayBuffer> {
  const type = headers.get('Content-Type') ?? '';
  if (bytes.length < 1024 || !/^(text\/|application\/(javascript|json|xml))/.test(type) || headers.has('Content-Encoding')) return new Uint8Array(bytes);
  const vary = headers.get('Vary');
  if (!vary?.split(',').some(value => value.trim().toLowerCase() === 'accept-encoding')) headers.set('Vary', [vary, 'Accept-Encoding'].filter(Boolean).join(', '));
  const entries = (request.headers.get('Accept-Encoding') ?? '').toLowerCase().split(',').map(value => value.trim().split(';'));
  const gzip = entries.find(([name]) => name === 'gzip');
  const quality = gzip?.slice(1).find(value => value.trim().startsWith('q='))?.trim().slice(2);
  if (!gzip || (quality !== undefined && (!/^0(?:\.\d{0,3})?$|^1(?:\.0{0,3})?$/.test(quality) || Number(quality) === 0))) return new Uint8Array(bytes);
  const compressed = gzipSync(bytes);
  headers.set('Content-Encoding', 'gzip');
  headers.set('Content-Length', String(compressed.length));
  return new Uint8Array(compressed);
}
