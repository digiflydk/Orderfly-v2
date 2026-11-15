import { headers } from 'next/headers';
import { brandSlugFromHost, brandSubdomainUrl, storefrontPath } from '@/lib/brand-subdomain';
import { getBrandBySlug, getLocationsForBrand } from '@/lib/data/brand-location';
import { publicSitemap } from '@/lib/storefront-seo';
import { orderableLocations } from '@/lib/storefront-single-location';
export async function GET() {
  const h = await headers();
  const slug = brandSlugFromHost(h.get('x-forwarded-host') ?? h.get('host'));
  const origin = slug ? brandSubdomainUrl(slug) : 'https://orderfly.dk';
  let paths = ['/'];
  if (slug) {
    const brand = await getBrandBySlug(slug);
    if (!brand || brand.status === 'suspended') return new Response('Not found',{status:404});
    const locations = await getLocationsForBrand(brand.id);
    const orderable = orderableLocations(brand.id, locations);
    // With a single restaurant the brand root only redirects to its menu, so it is not listed.
    if (orderable.length === 1) paths = [];
    paths.push(...orderable.map(l=>storefrontPath(slug,true,l.slug)));
  }
  return new Response(publicSitemap(origin,paths),{headers:{'Content-Type':'application/xml; charset=utf-8'}});
}
