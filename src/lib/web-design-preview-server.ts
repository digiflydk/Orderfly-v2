import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import manifest from '../../preview/esmeralda/manifest.json';
import { isWebDesignPreviewHost, WEB_PREVIEW_HEADERS } from '@/lib/web-design-preview';

type Entry = { data: string; file: string; sha256: string; size: number };
const routes: Record<string, Omit<Entry, 'data'>> = manifest.routes;
const mime: Record<string, string> = {html:'text/html; charset=utf-8', txt:'text/plain; charset=utf-8', js:'application/javascript; charset=utf-8', css:'text/css; charset=utf-8', json:'application/json', svg:'image/svg+xml', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', avif:'image/avif', gif:'image/gif', ico:'image/x-icon', woff:'font/woff', woff2:'font/woff2', ttf:'font/ttf', otf:'font/otf'};
let payload: Promise<Record<string, Entry>> | undefined;
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function loadPayload() {
  return payload ??= Promise.all([0,1,2].map(index => readFile(join(process.cwd(), `preview/esmeralda/payload.json.gz.part-${String(index).padStart(3, '0')}`)))).then(parts => {
    const bytes = Buffer.concat(parts);
    if (sha(bytes) !== manifest.payload_sha256) throw new Error('Preview payload integrity mismatch');
    const entries = JSON.parse(gunzipSync(bytes, {maxOutputLength: 100 * 1024 * 1024}).toString('utf8')) as Record<string, Entry>;
    if (Object.keys(entries).length !== Object.keys(routes).length) throw new Error('Preview inventory mismatch');
    return entries;
  });
}
export async function webDesignPreviewResponse(request: Request): Promise<Response> {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!isWebDesignPreviewHost(host)) return new Response('Not found', {status:404});
  const headers = new Headers(WEB_PREVIEW_HEADERS);
  if (!['GET','HEAD'].includes(request.method)) {
    headers.set('Allow','GET, HEAD');
    return new Response('Method not allowed', {status:405, headers});
  }
  const path = new URL(request.url).searchParams.get('path') ?? '';
  // Exact route keys only: no decoding, path joining, extension fallback or SPA fallback.
  if (!Object.hasOwn(routes,path)) return new Response(request.method === 'HEAD' ? null : 'Not found', {status:404,headers});
  try {
    const entry = (await loadPayload())[path];
    const expected = routes[path];
    const bytes = Buffer.from(entry.data,'base64');
    if (bytes.length !== expected.size || sha(bytes) !== expected.sha256) throw new Error('Preview entry integrity mismatch');
    headers.set('Content-Type', mime[expected.file.split('.').pop()!] ?? 'application/octet-stream');
    headers.set('Content-Length', String(bytes.length));
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), {headers});
  } catch {
    return new Response(request.method === 'HEAD' ? null : 'Preview unavailable', {status:503,headers});
  }
}
