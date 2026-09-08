'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { Brand } from '@/types';
import { useCart } from '@/context/cart-context';
import { safeImage } from '@/lib/images';
export function MenuHeader({ brand }: {
    brand: Brand;
}) {
    const { location } = useCart();
    const pathname = usePathname();
    const checkout = pathname?.includes('/checkout');
    const href = location ? `/${brand.slug}/${location.slug}` : `/${brand.slug}`;
    const Logo = <>{brand.logoUrl ? <Image src={safeImage(brand.logoUrl)} alt={brand.name} fill sizes="80px" className="object-contain"/> : <span className="font-bold">{brand.name}</span>}</>;
    return <header className="sticky top-0 z-40 w-full border-b bg-[#FFF8F0]">
    <div className="mx-auto flex h-16 max-w-[1140px] items-center justify-between gap-4 px-4">
      {checkout ? <div className="relative h-10 w-20 shrink-0">{Logo}</div> : <Link href={href} aria-label={brand.name} className="relative h-10 w-20 shrink-0">{Logo}</Link>}
      <p className="truncate text-right text-sm font-semibold">{location?.name || brand.name}</p>
    </div>
  </header>;
}
