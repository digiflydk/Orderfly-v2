import { headers } from 'next/headers';
import { brandSlugFromHost, brandSubdomainUrl } from '@/lib/brand-subdomain';
export async function GET() {
  const h = await headers();
  const slug = brandSlugFromHost(h.get('x-forwarded-host') ?? h.get('host'));
  const origin = slug ? brandSubdomainUrl(slug) : 'https://orderfly.dk';
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`, {headers:{'Content-Type':'text/plain; charset=utf-8'}});
}
