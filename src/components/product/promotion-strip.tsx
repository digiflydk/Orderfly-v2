'use client';
import type { StandardDiscount, ProductForMenu } from '@/types';
import { isQuantityMethod, quantityOfferLabel } from '@/lib/automatic-discounts';
import { formatPrice } from '@/lib/storefront-format';
import { useStorefrontV2 } from '@/context/storefront-v2-context';
import { safeImage } from '@/lib/images';
import { esmeraldaPizzaImage } from '@/lib/esmeralda-menu-images';
export function PromotionStrip({ discounts, products }: {
    discounts: StandardDiscount[];
    products: ProductForMenu[];
}) {
    const isV2 = useStorefrontV2();
    const offers = discounts.filter(d => d.assignToOfferCategory && Array.isArray(d.referenceIds) && (isQuantityMethod(d.discountMethod) || (typeof d.discountValue === 'number' && Number.isFinite(d.discountValue) && d.discountValue > 0)) && products.some(p => d.discountType === 'product' ? d.referenceIds.includes(p.id) : d.discountType === 'category' && d.referenceIds.includes(p.categoryId))).slice(0, 3);
    if (!offers.length)
        return null;
    return <section data-v2-promotions={isV2 || undefined} aria-label="Aktuelle tilbud" className="flex gap-3 overflow-x-auto py-4 snap-x">
    {offers.map(offer => {
      const image = products.find(product => product.imageUrl && (offer.discountType === 'product' ? offer.referenceIds.includes(product.id) : offer.referenceIds.includes(product.categoryId)));
      const cutout = image && esmeraldaPizzaImage(isV2, image);
      return <button key={offer.id} className="commerce-promotion-card shrink-0 snap-start rounded-xl border bg-yellow-50 px-4 py-3 text-left max-w-[260px]" onClick={() => document.getElementById('category-offers')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}>
      {isV2 && image && <img src={cutout?.src || safeImage(image.imageUrl)} data-pizza-cutout={cutout ? '' : undefined} alt="" loading="lazy" className="v2-promotion-image" style={cutout ? {objectFit: 'contain'} : undefined} />}
      <span className="block font-semibold">{offer.discountName}</span><span className="block text-sm">{isQuantityMethod(offer.discountMethod) ? quantityOfferLabel(offer) : offer.discountMethod === 'percentage' ? `${offer.discountValue}% på udvalgte varer` : `Spar ${formatPrice(offer.discountValue || 0)} på udvalgte varer`}</span>
      {!!offer.minOrderValue && <span className="block text-xs">Ved køb for mindst {formatPrice(offer.minOrderValue)}</span>}
      <span className="block text-xs underline mt-1">Se varerne</span>
    </button>;})}
  </section>;
}
