'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Brand } from '@/types';
import { useEffect, useState } from 'react';

export function Header({ brand }: { brand: Brand }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const href = `/${brand.slug}`;
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);

  return (
    <header data-header>
      <div className="mx-auto flex h-16 max-w-[1140px] items-center justify-between gap-4 px-4">
        <Link href={href} className="flex min-w-0 items-center gap-2">
          {brand.logoUrl ? (
            <div className="relative h-9 w-[164px] shrink-0">
              <Image src={brand.logoUrl} alt={brand.name} fill sizes="164px" className="object-contain object-left" priority />
            </div>
          ) : <span className="truncate font-semibold">{brand.name}</span>}
        </Link>
        <nav aria-label="Bestilling" className="hidden items-center gap-6 md:flex">
          <Link href={href} className="text-sm text-foreground hover:text-primary">Bestil</Link>
        </nav>
        <button type="button" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-controls="storefront-mobile-navigation" className="shrink-0 md:hidden text-sm text-foreground hover:text-primary" aria-label="Åbn menu">
          Menu
        </button>
      </div>
      {menuOpen && <nav id="storefront-mobile-navigation" aria-label="Mobilmenu" className="md:hidden border-t bg-background p-4 flex flex-col gap-4">
        <Link href={href} onClick={() => setMenuOpen(false)} className="text-foreground">Bestil</Link>
      </nav>}
    </header>
  );
}
