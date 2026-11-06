import type { Metadata } from 'next';
import { brandSlugError, brandSubdomainUrl, storefrontPath } from './brand-subdomain';

export function storefrontMenuMetadata(brand: {slug:string;name:string}, location: {slug:string;name:string}): Metadata {
  if (brandSlugError(brand.slug) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(location.slug)) return {robots:{index:false,follow:false}};
  const url = `${brandSubdomainUrl(brand.slug)}${storefrontPath(brand.slug, true, location.slug)}`;
  const place = location.name || brand.name;
  const title = `Menukort og takeaway | ${place}`;
  const description = `Se menukortet hos ${place}. Vælg dine retter, se priser og tilvalg, og bestil din mad direkte online.`;
  return {title:{absolute:title},description,alternates:{canonical:url},
    openGraph:{type:'website',locale:'da_DK',siteName:brand.name,title,description,url},
    twitter:{card:'summary',title,description}};
}

export function publicSitemap(origin:string, paths:string[]) {
  const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(paths)].map(path=>`<url><loc>${escape(origin+path)}</loc></url>`).join('')}</urlset>`;
}
