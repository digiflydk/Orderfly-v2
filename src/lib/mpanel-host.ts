import table from '../../mpanel/esmeralda/routes.json';
export const MPANEL_INTERNAL = '/internal-mpanel-host';
export const MPANEL_ORIGIN = 'https://mpanel.esmeraldapizza.dk';
export function isMpanelHost(host: string | null): boolean {
  return /^mpanel\.esmeraldapizza\.dk(?::443)?$/i.test((host ?? '').trim());
}
export const MPANEL_HEADERS = {
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
const legacy = new Map<string, string>();
const aliases = new Map<string, string>();
for (const route of table.routes) {
  for (const path of route.legacy_paths) {
    legacy.set(path, route.target_path);
    legacy.set(path + '/', route.target_path);
  }
  for (const path of route.aliases) {
    aliases.set(path, route.target_path);
    aliases.set(path + '/', route.target_path);
  }
  if (route.target_path !== '/') aliases.set(route.target_path + '/', route.target_path);
}
function resolve(map: Map<string, string>, pathname: string, rawSearch: string): string | null {
  // Never parse/re-encode the query: duplicate keys, escaped delimiters and plus signs survive.
  if (rawSearch && (!rawSearch.startsWith('?') || /[\x00-\x20\x7f#\\]/.test(rawSearch))) return null;
  const target = map.get(pathname);
  return target === undefined ? null : MPANEL_ORIGIN + target + rawSearch;
}
export function resolveLegacyMpanelRedirect(pathname: string, rawSearch: string): string | null {
  return resolve(legacy, pathname, rawSearch);
}
export function resolveMpanelAliasRedirect(pathname: string, rawSearch: string): string | null {
  return resolve(aliases, pathname, rawSearch);
}
