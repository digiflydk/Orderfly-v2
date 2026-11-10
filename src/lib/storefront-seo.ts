import type { Metadata } from 'next';
import { brandSlugError, brandSubdomainUrl, storefrontPath } from './brand-subdomain';
import { PRODUCT_LINK_PARAM } from './product-link';

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

/**
 * A shared product link (?produkt=) previews the product itself. The canonical
 * stays the menu, so search engines index one page per restaurant.
 */
export function storefrontProductMetadata(brand: {slug:string;name:string}, location: {slug:string;name:string}, product: {productName?:string;description?:string;imageUrl?:string|null}, link: string): Metadata {
  const menu = storefrontMenuMetadata(brand, location);
  if (!menu.alternates?.canonical || !product.productName) return menu;
  const url = `${menu.alternates.canonical}?${new URLSearchParams({[PRODUCT_LINK_PARAM]: link})}`;
  const place = location.name || brand.name;
  const title = `${product.productName} | ${place}`;
  const description = (product.description?.trim() || `Bestil ${product.productName} hos ${place} til afhentning eller levering.`).slice(0, 300);
  const origin = brandSubdomainUrl(brand.slug);
  // Only an address a social network can fetch; inline data images are left out.
  const image = /^https:\/\//.test(product.imageUrl ?? '') ? product.imageUrl! : /^\/[^/]/.test(product.imageUrl ?? '') ? origin + product.imageUrl : undefined;
  return {...menu, title:{absolute:title}, description,
    openGraph:{type:'website',locale:'da_DK',siteName:brand.name,title,description,url,...(image?{images:[{url:image}]}:{})},
    twitter:{card:image?'summary_large_image':'summary',title,description,...(image?{images:[image]}:{})}};
}

export function publicSitemap(origin:string, paths:string[]) {
  const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...new Set(paths)].map(path=>`<url><loc>${escape(origin+path)}</loc></url>`).join('')}</urlset>`;
}
