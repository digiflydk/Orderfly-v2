import 'server-only';
import { headers } from 'next/headers';
import { brandSlugFromHost, storefrontPath } from '@/lib/brand-subdomain';

// Server redirects stay on the address the customer uses (#282), like portalBase.
export async function storefrontHref(slug: string, ...segments: string[]) {
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  return storefrontPath(slug, brandSlugFromHost(host) === slug, ...segments);
}
