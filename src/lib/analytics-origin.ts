import { ROOT_DOMAIN, brandSlugFromHost } from './brand-subdomain';

// App Hosting can expose an internal request URL behind its HTTPS proxy.
// Use explicit public origins, never client-supplied forwarded-host headers.
export function analyticsOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Preserve non-browser emitters; payload validation still applies.
  const allowed = new Set(['https://orderfly.dk', 'https://www.orderfly.dk']);
  if (process.env.SITE_URL) {
    try {
      const configured = new URL(process.env.SITE_URL);
      if (configured.protocol === 'https:') allowed.add(configured.origin);
    } catch { /* Invalid configuration never authorizes an origin. */ }
  }
  if (process.env.NODE_ENV !== 'production') allowed.add(new URL(request.url).origin);
  return allowed.has(origin) || isBrandSubdomainOrigin(origin);
}

// Storefronts on https://{slug}.orderfly.dk (#12): one valid, unreserved label, HTTPS, default port.
function isBrandSubdomainOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && !url.port && url.origin === origin &&
      url.hostname.endsWith(`.${ROOT_DOMAIN}`) && brandSlugFromHost(url.hostname) !== null;
  } catch {
    return false;
  }
}
