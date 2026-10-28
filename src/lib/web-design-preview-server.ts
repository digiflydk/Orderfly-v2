import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import manifest from '../../preview/esmeralda/manifest.json';
import { resolveLegacyMpanelRedirect, MPANEL_HEADERS } from '@/lib/mpanel-host';
import discovery from '../../preview/esmeralda/production-discovery.json';
import { isEsmeraldaPublicHost, esmeraldaPublicEnabled, esmeraldaCanonicalRedirect, esmeraldaPublicHeaders, ESMERALDA_UNAVAILABLE_HEADERS } from '@/lib/esmeralda-public-host';
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
  const production = isEsmeraldaPublicHost(host);
  if (!production && !isWebDesignPreviewHost(host)) return new Response('Not found', {status:404});
  if (production && !esmeraldaPublicEnabled()) return new Response(request.method === 'HEAD' ? null : 'Website unavailable', {status:503, headers:ESMERALDA_UNAVAILABLE_HEADERS});
  const url = new URL(request.url);
  const headers = new Headers(production ? esmeraldaPublicHeaders(url.pathname) : WEB_PREVIEW_HEADERS);
  if (!['GET','HEAD'].includes(request.method)) {
    headers.set('Allow','GET, HEAD');
    return new Response('Method not allowed', {status:405, headers});
  }
  const path = url.pathname;
  // Middleware NextURL normalizes search parameters. App Router preserves the original request URL.
  const rawSearch = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')).split('#')[0] : '';
  if (production) {
    const legacyTarget = resolveLegacyMpanelRedirect(path, rawSearch);
    if (legacyTarget) return new Response(null, {status:308, headers:{...MPANEL_HEADERS, Location:legacyTarget}});
    const target = esmeraldaCanonicalRedirect(url, host, request.headers.get('x-forwarded-proto'));
    if (target) { headers.set('Location', target); return new Response(null, {status:308, headers}); }
    if (path === '/robots.txt' || path === '/sitemap.xml') {
      const pagePaths = Object.entries(routes).filter(([,entry]) => entry.file.endsWith('.html')).map(([route]) => route).sort();
      const sitemapPaths = discovery.public_urls.map(value => new URL(value).pathname).sort();
      if (discovery.source_manifest_sha256 !== manifest.source_manifest_sha256 || JSON.stringify(pagePaths) !== JSON.stringify(sitemapPaths) || pagePaths.length !== 104) {
        return new Response(null, {status:503, headers:ESMERALDA_UNAVAILABLE_HEADERS});
      }
      const body = path === '/robots.txt'
        ? 'User-agent: *\nAllow: /\n' + ['mpanel','hr','finance-admin','kunder-admin','produktion-admin','admin-v2','bordbooking-admin','bordbooking-iframe'].map(route => `Disallow: /${route}\n`).join('') + 'Sitemap: https://www.esmeraldapizza.dk/sitemap.xml\n'
        : '<?xml version="1.0" encoding="utf-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + discovery.public_urls.map(value => `<url><loc>${value}</loc></url>`).join('') + '</urlset>\n';
      headers.set('Content-Type', path === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8');
      headers.set('Content-Length', String(Buffer.byteLength(body)));
      return new Response(request.method === 'HEAD' ? null : body, {headers});
    }
  }
  // Restore the source-owned legacy handoff instead of serving its inert mount.
  // A relative Location keeps the preview host; omitting a fragment lets browsers
  // carry the original fragment forward. Keep encoded query bytes untouched.
  if (path === '/book-bord') {
    headers.set('Location', '/bordbooking' + rawSearch);
    return new Response(null, {status:307, headers});
  }
  // Exact route keys only: no decoding, path joining, extension fallback or SPA fallback.
  if (!Object.hasOwn(routes,path)) { headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive'); return new Response(request.method === 'HEAD' ? null : 'Not found', {status:404,headers}); }
  try {
    const entry = (await loadPayload())[path];
    const expected = routes[path];
    const bytes = Buffer.from(entry.data,'base64');
    if (bytes.length !== expected.size || sha(bytes) !== expected.sha256) throw new Error('Preview entry integrity mismatch');
    headers.set('Content-Type', mime[expected.file.split('.').pop()!] ?? 'application/octet-stream');
    headers.set('Content-Length', String(bytes.length));
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(bytes), {headers});
  } catch {
    return new Response(request.method === 'HEAD' ? null : 'Website unavailable', {status:503,headers:{...Object.fromEntries(headers),...ESMERALDA_UNAVAILABLE_HEADERS}});
  }
}
