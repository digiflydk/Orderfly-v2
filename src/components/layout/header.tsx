'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Brand } from '@/types';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

type Props = {
  brand?: Brand;           // valgfri, så Header kan bruges på /
  linkClass?: string;      // styres af Website CMS på /
};

export function Header({ brand, linkClass = 'text-white hover:text-primary' }: Props) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'top-0 z-40 w-full transition-colors',
        scrolled ? 'bg-white/90 backdrop-blur border-b border-black/5' : 'bg-transparent'
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1140px] items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          {brand?.logoUrl ? (
            <Image
              src={brand.logoUrl}
              alt={brand.name || 'Logo'}
              width={128}
              height={36}
              className="h-9 w-auto object-contain"
              priority
            />
          ) : (
            <span className="font-semibold">OrderFly</span>
          )}
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <Link href="/online-order" className={cn('text-sm', linkClass)}>Online ordre</Link>
          <Link href="/pricing" className={cn('text-sm', linkClass)}>Priser</Link>
          <Link href="/customers" className={cn('text-sm', linkClass)}>Kunder</Link>
          <Link href="/contact" className={cn('text-sm', linkClass)}>Kontakt</Link>
        </nav>

        <button className={cn('md:hidden text-sm', linkClass)} aria-label="Open menu">
          Menu
        </button>
      </div>
    </header>
  );
}