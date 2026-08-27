const CANONICAL_HOST = 'orderfly.dk';
const WWW_HOST = `www.${CANONICAL_HOST}`;

function normalizeHost(host: string | null): string {
  return (host ?? '').split(':')[0].trim().toLowerCase();
}

function normalizeProto(proto: string | null): string {
  return (proto ?? '').split(',')[0].trim().toLowerCase();
}

export function resolveProductionRedirect(url: URL, hostHeader: string | null, forwardedProto: string | null): string | null {
  const host = normalizeHost(hostHeader);
  const proto = normalizeProto(forwardedProto) || url.protocol.replace(':', '');
  if (host !== WWW_HOST && !(host === CANONICAL_HOST && proto === 'http')) return null;
  const redirectUrl = new URL(url.toString());
  redirectUrl.protocol = 'https:';
  redirectUrl.host = CANONICAL_HOST;
  return redirectUrl.toString();
}
