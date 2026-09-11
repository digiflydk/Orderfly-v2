'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Brand, Location } from '@/types';
import { useCart } from '@/context/cart-context';
import { safeImage } from '@/lib/images';
import { formatPrice } from '@/lib/storefront-format';
import { locationHeaderDetails } from '@/lib/location-header';
import { PublicReviewsLink } from '@/components/feedback/public-reviews-link';

export function MenuHeader({ brand, initialLocation, initialNow }: {
  brand: Brand;
  initialLocation?: Location;
  initialNow?: number;
}) {
  const { location: cartLocation } = useCart();
  // The route owns the location; a restored cart may still belong to another branch.
  const candidate = initialLocation ?? cartLocation;
  const location = candidate?.brandId === brand.id ? candidate : null;
  const pathname = usePathname();
  const checkout = pathname?.includes('/checkout');
  const href = location ? `/${brand.slug}/${location.slug}` : `/${brand.slug}`;
  const [now, setNow] = useState<Date | null>(() => initialNow === undefined ? null : new Date(initialNow));
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const details = location ? locationHeaderDetails(location, now || new Date(0)) : null;
  const logo = brand.logoUrl
    ? <Image src={safeImage(brand.logoUrl)} alt={brand.name} fill sizes="144px" priority className="object-contain object-left" />
    : <span className="text-xl font-bold">{brand.name}</span>;

  return <>
    <header data-storefront-header data-brand-slug={brand.slug} className="sticky top-0 z-40 h-16 w-full border-b bg-[#FFF8F0]">
      <div className="mx-auto flex h-full max-w-[1140px] items-center justify-between gap-4 px-4">
        {checkout
          ? <div className="relative flex h-10 w-36 shrink-0 items-center">{logo}</div>
          : <Link href={href} aria-label={brand.name} className="relative flex h-10 w-36 shrink-0 items-center">{logo}</Link>}
        {checkout && <p className="min-w-0 flex-1 truncate text-right text-sm font-semibold">{location?.name || brand.name}</p>}
      </div>
    </header>
    {!checkout && location && details && <section data-storefront-location data-brand-slug={brand.slug} aria-label="Lokationsoplysninger" className="relative isolate overflow-hidden bg-[#262421] text-white">
      {location.imageUrl && <>
        {/* Location URLs are user-configured and are not limited to Next Image's host allowlist. */}
        <img src={safeImage(location.imageUrl)} alt="" loading="eager" fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-black/65" />
      </>}
      <div className="mx-auto max-w-[1140px] px-4 py-6 sm:py-8">
        <h1 className="break-words text-2xl font-bold tracking-tight sm:text-4xl">{location.name}</h1>
        <PublicReviewsLink brandId={brand.id} href={`${href}/reviews`} />
        {details.address && <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(details.address)}`}
          target="_blank" rel="noopener noreferrer"
          className="mt-2 inline-block break-words text-base text-white/90 underline decoration-dotted underline-offset-4 hover:text-white sm:text-xl"
        >{details.address}</a>}
        {now && details.opening && <p className="mt-2 text-sm text-white/90 sm:text-base">Åbningstid i dag: {details.opening}</p>}
        {details.delivery && (Number.isFinite(location.deliveryFee) || (Number.isFinite(location.minOrder) && location.minOrder > 0)) && <div className="mt-4 flex flex-wrap gap-2 text-sm sm:text-base">
          {details.delivery && Number.isFinite(location.deliveryFee) && <p className="rounded-lg border border-white/70 px-3 py-2">Levering fra: {formatPrice(location.deliveryFee)}</p>}
          {Number.isFinite(location.minOrder) && location.minOrder > 0 && <p className="rounded-lg border border-white/70 px-3 py-2">Minimumsbestilling: {formatPrice(location.minOrder)}</p>}
        </div>}
      </div>
    </section>}
  </>;
}
