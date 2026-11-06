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
import { ArrowLeft, User } from 'lucide-react';
import { LocationInfoDialog } from '@/components/storefront/location-info-dialog';
import { useClubSession } from '@/hooks/use-club-session';

export function MenuHeader({ brand, initialLocation, initialNow }: {
  brand: Brand;
  initialLocation?: Location;
  initialNow?: number;
}) {
  const isV2 = useStorefrontV2();
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
  // V2 uses one header on the landing page, the menu and checkout: logo, account and restaurant info.
  const landing = segments.length === 0;
  const v2Bar = isV2 && (refreshedMenu || checkout || landing);
  const club = useClubSession(v2Bar ? brand.slug : null, true);
  const accountLabel = club.signedIn ? (club.firstName || 'Min Club') : 'Log ind';
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

  const actions = <div className="v2-header-actions">
    <Link href={club.signedIn ? storefront('club') : storefront('club', 'login')} aria-label={club.signedIn ? `Min Club · ${accountLabel}` : 'Log ind'} data-signed-in={club.signedIn || undefined} className="v2-header-login"><User aria-hidden="true" className="h-4 w-4" /><span>{accountLabel}</span></Link>
    {location && <LocationInfoDialog brand={brand} location={location} />}
  </div>;

  if (v2Bar) return <>
    <header ref={headerRef} data-menu-refresh={refreshedMenu || undefined} data-v2-bar={checkout ? 'checkout' : landing ? 'landing' : 'menu'} data-storefront-header data-v2-menu-header data-brand-slug={brand.slug} className="sticky top-0 z-40 w-full border-b">
      <div className="storefront-frame storefront-order-toolbar">
        {checkout && <div className="v2-header-back"><Link href={href}><ArrowLeft aria-hidden="true" className="h-4 w-4" /><span>Menu</span></Link></div>}
        <Link href={checkout ? href : landing ? storefront() : href} aria-label={brand.name} className="relative flex h-10 w-24 shrink-0 items-center">{logo}</Link>
        {actions}
        {refreshedMenu && <><div className="storefront-order-controls" data-menu-controls-slot /><div className="storefront-top-cart" data-menu-cart-slot /></>}
        {refreshedMenu && showDelivery && details?.delivery && location && <div className="v2-delivery-summary text-xs text-muted-foreground">
          {(managed || Number.isFinite(location.deliveryFee)) && <p>{managed ? 'Leveringspris beregnes i kassen' : `Levering fra: ${formatPrice(location.deliveryFee)}`}</p>}
          {Number.isFinite(location.minOrder) && location.minOrder > 0 && <p>Minimumsbestilling: {formatPrice(location.minOrder)}</p>}
        </div>}
      </div>
    </header>
    {refreshedMenu && location && <h1 className="sr-only">{location.name} · Menukort</h1>}
    {/* Desktop banner (CSS hides it on mobile): the location photo with name, address, today's hours and delivery terms. */}
    {refreshedMenu && location && details && <section data-v2-location-banner className="storefront-frame" aria-label="Lokationsoplysninger">
      {location.imageUrl && <img src={safeImage(location.imageUrl)} alt="" loading="eager" fetchPriority="high" />}
      <div className="v2-banner-copy">
        <h2>{location.name}</h2>
        {details.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.address)}`} target="_blank" rel="noopener noreferrer">{details.address}</a>}
        {now && details.opening && <p>Åbningstid i dag: {details.opening}</p>}
        {showDelivery && details.delivery && <div className="v2-banner-terms">
          {(managed || Number.isFinite(location.deliveryFee)) && <span>{managed ? 'Leveringspris beregnes i kassen' : `Levering fra ${formatPrice(location.deliveryFee)}`}</span>}
          {Number.isFinite(location.minOrder) && location.minOrder > 0 && <span>Minimumsbestilling {formatPrice(location.minOrder)}</span>}
        </div>}
      </div>
    </section>}
  </>;

  return <>
    <header ref={headerRef} data-menu-refresh={refreshedMenu || undefined} data-storefront-header data-v2-menu-header={isV2 || undefined} data-brand-slug={brand.slug} className="sticky top-0 z-40 h-16 w-full border-b bg-[#FFF8F0]">
      <div className={refreshedMenu ? "storefront-frame storefront-order-toolbar" : `mx-auto flex h-full max-w-[1140px] items-center ${checkout && isV2 ? 'justify-center' : 'justify-between'} gap-4 px-4`}>
        {checkout
          ? <div data-v2-checkout-logo={isV2 || undefined} className={isV2 ? "relative flex h-11 w-[168px] shrink-0 items-center" : "relative flex h-10 w-36 shrink-0 items-center"}>{logo}</div>
          : <Link href={href} aria-label={brand.name} className="relative flex h-10 w-24 shrink-0 items-center">{logo}</Link>}
        {refreshedMenu && <><div className="storefront-order-controls" data-menu-controls-slot /><div className="storefront-top-cart" data-menu-cart-slot /></>}
        {isV2 && refreshedMenu && showDelivery && details?.delivery && location && <div className="v2-delivery-summary text-xs text-muted-foreground">
          {(managed || Number.isFinite(location.deliveryFee)) && <p>{managed ? 'Leveringspris beregnes i kassen' : `Levering fra: ${formatPrice(location.deliveryFee)}`}</p>}
          {Number.isFinite(location.minOrder) && location.minOrder > 0 && <p>Minimumsbestilling: {formatPrice(location.minOrder)}</p>}
        </div>}
        {checkout && !isV2 && <p className="min-w-0 flex-1 truncate text-right text-sm font-semibold">{location?.name || brand.name}</p>}
      </div>
    </header>
    {!checkout && location && details && !isV2 && <section data-storefront-location data-brand-slug={brand.slug} data-menu-hero={!isV2 && refreshedMenu || undefined} data-v2-location-details={isV2 || undefined} aria-label="Lokationsoplysninger" className="relative isolate overflow-hidden bg-[#262421] text-white">
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
