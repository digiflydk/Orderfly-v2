'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Brand, Location } from '@/types';
import { useCart } from '@/context/cart-context';
import { useManagedDeliveryPrice } from '@/context/delivery-price-context';
import { safeImage } from '@/lib/images';
import { formatPrice } from '@/lib/storefront-format';
import { locationHeaderDetails } from '@/lib/location-header';
import { PublicReviewsLink } from '@/components/feedback/public-reviews-link';
import { storefrontSegments } from '@/lib/brand-subdomain';
import { useStorefrontPath } from '@/hooks/use-storefront-path';
import { useStorefrontV2 } from '@/context/storefront-v2-context';
import { Menu, Info } from 'lucide-react';

export function MenuHeader({ brand, initialLocation, initialNow }: {
  brand: Brand;
  initialLocation?: Location;
  initialNow?: number;
}) {
  const isV2 = useStorefrontV2();
  const [showLocation, setShowLocation] = useState(false);
  const { location: cartLocation, deliveryType, cartReady } = useCart();
  const managed = useManagedDeliveryPrice();
  // The route owns the location; a restored cart may still belong to another branch.
  const candidate = initialLocation ?? cartLocation;
  const location = candidate?.brandId === brand.id ? candidate : null;
  const pathname = usePathname();
  const checkout = pathname?.includes('/checkout');
  const segments = storefrontSegments(pathname, brand.slug);
  const refreshedMenu = brand.slug === 'esmeralda' && !!location && segments.length === 1 && segments[0] === location.slug;
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!refreshedMenu || !headerRef.current) return;
    const header = headerRef.current;
    const frame = header.closest<HTMLElement>('[data-commerce-root][data-brand-slug]');
    if (!frame) return;
    const measure = () => frame.style.setProperty('--storefront-header-height', `${getComputedStyle(header).position === 'sticky' ? header.getBoundingClientRect().height : 0}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => { observer.disconnect(); frame.style.removeProperty('--storefront-header-height'); };
  }, [refreshedMenu]);
  const storefront = useStorefrontPath(brand.slug);
  const href = location ? storefront(location.slug) : storefront();
  const [now, setNow] = useState<Date | null>(() => initialNow === undefined ? null : new Date(initialNow));
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const showDelivery = !refreshedMenu || (cartReady && cartLocation?.id === location?.id && deliveryType === 'delivery');
  const details = location ? locationHeaderDetails(location, now || new Date(0)) : null;
  const logo = brand.logoUrl
    ? <Image src={safeImage(brand.logoUrl)} alt={brand.name} fill sizes="168px" priority className={checkout && isV2 ? "object-contain object-center" : "object-contain object-left"} />
    : <span className="text-xl font-bold">{brand.name}</span>;

  return <>
    <header ref={headerRef} data-menu-refresh={refreshedMenu || undefined} data-storefront-header data-v2-menu-header={isV2 || undefined} data-brand-slug={brand.slug} className="sticky top-0 z-40 h-16 w-full border-b bg-[#FFF8F0]">
      <div className={refreshedMenu ? "storefront-frame storefront-order-toolbar" : `mx-auto flex h-full max-w-[1140px] items-center ${checkout && isV2 ? 'justify-center' : 'justify-between'} gap-4 px-4`}>
        {isV2 && !checkout && <button type="button" className="v2-menu-browse" aria-label="Gå til menukategorier" onClick={() => document.querySelector('[data-storefront-categories]')?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'})}><Menu className="h-5 w-5" /></button>}
        {checkout
          ? <div data-v2-checkout-logo={isV2 || undefined} className={isV2 ? "relative flex h-11 w-[168px] shrink-0 items-center" : "relative flex h-10 w-36 shrink-0 items-center"}>{logo}</div>
          : <Link href={href} aria-label={brand.name} className="relative flex h-10 w-24 shrink-0 items-center">{logo}</Link>}
        {isV2 && !checkout && <button type="button" className="v2-location-toggle" aria-label="Restaurantoplysninger" aria-expanded={showLocation} aria-controls="v2-location-details" onClick={() => setShowLocation(value => !value)}><Info className="h-5 w-5" /></button>}
        {refreshedMenu && <><div className="storefront-order-controls" data-menu-controls-slot /><div className="storefront-top-cart" data-menu-cart-slot /></>}
        {isV2 && refreshedMenu && showDelivery && details?.delivery && location && <div className="v2-delivery-summary text-xs text-muted-foreground">
          {(managed || Number.isFinite(location.deliveryFee)) && <p>{managed ? 'Leveringspris beregnes i kassen' : `Levering fra: ${formatPrice(location.deliveryFee)}`}</p>}
          {Number.isFinite(location.minOrder) && location.minOrder > 0 && <p>Minimumsbestilling: {formatPrice(location.minOrder)}</p>}
        </div>}
        {checkout && !isV2 && <p className="min-w-0 flex-1 truncate text-right text-sm font-semibold">{location?.name || brand.name}</p>}
      </div>
    </header>
    {isV2 && !checkout && location && <h1 className="sr-only">{location.name} · Menukort</h1>}
    {!checkout && location && details && (!isV2 || showLocation) && <section id={isV2 ? 'v2-location-details' : undefined} data-storefront-location data-brand-slug={brand.slug} data-menu-hero={!isV2 && refreshedMenu || undefined} data-v2-location-details={isV2 || undefined} aria-label="Lokationsoplysninger" className="relative isolate overflow-hidden bg-[#262421] text-white">
      {location.imageUrl && <>
        {/* Location URLs are user-configured and are not limited to Next Image's host allowlist. */}
        <img src={safeImage(location.imageUrl)} alt="" loading="eager" fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/90 via-black/45 to-black/10" />
      </>}
      <div className={refreshedMenu ? "storefront-hero-copy" : "mx-auto max-w-[1140px] px-4 py-6 sm:py-8"}>
        {isV2 ? <h2 className="text-lg font-semibold">{location.name}</h2> : <h1 className="break-words text-2xl font-bold tracking-tight sm:text-4xl">{location.name}</h1>}
        <PublicReviewsLink brandId={brand.id} href={`${href}/reviews`} />
        {details.address && <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.address)}`}
          target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-block break-words text-base text-white/90 underline decoration-dotted underline-offset-4 hover:text-white sm:text-xl"
        >{details.address}</a>}
        {now && details.opening && <p className="mt-2 text-sm text-white/90 sm:text-base">Åbningstid i dag: {details.opening}</p>}
        {!isV2 && showDelivery && details.delivery && (managed || Number.isFinite(location.deliveryFee) || (Number.isFinite(location.minOrder) && location.minOrder > 0)) && <div className="mt-4 flex flex-wrap gap-2 text-sm sm:text-base">
          {details.delivery && (managed || Number.isFinite(location.deliveryFee)) && <p className="rounded-lg border border-white/70 px-3 py-2">{managed ? 'Leveringspris beregnes i kassen' : `Levering fra: ${formatPrice(location.deliveryFee)}`}</p>}
          {Number.isFinite(location.minOrder) && location.minOrder > 0 && <p className="rounded-lg border border-white/70 px-3 py-2">Minimumsbestilling: {formatPrice(location.minOrder)}</p>}
        </div>}
      </div>
    </section>}
  </>;
}
