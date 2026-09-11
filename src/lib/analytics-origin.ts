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
  return allowed.has(origin);
}
