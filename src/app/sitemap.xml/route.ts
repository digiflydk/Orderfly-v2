import { headers } from 'next/headers';
import { brandSlugFromHost, brandSubdomainUrl } from '@/lib/brand-subdomain';
import { getBrandBySlug, getLocationsForBrand } from '@/lib/data/brand-location';
import { publicSitemap } from '@/lib/storefront-seo';
export async function GET() {
  const h = await headers();
  const slug = brandSlugFromHost(h.get('x-forwarded-host') ?? h.get('host'));
  const origin = slug ? brandSubdomainUrl(slug) : 'https://orderfly.dk';
  let paths = ['/'];
  if (slug) {
    const brand = await getBrandBySlug(slug);
    if (!brand || brand.status === 'suspended') return new Response('Not found',{status:404});
    const locations = await getLocationsForBrand(brand.id);
    paths.push(...locations.filter(l=>l.brandId===brand.id && l.isActive!==false && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(l.slug) && !['club','checkout','confirmation','cancel'].includes(l.slug)).map(l=>`/${encodeURIComponent(l.slug)}`));
  }
  return new Response(publicSitemap(origin,paths),{headers:{'Content-Type':'application/xml; charset=utf-8'}});
}
