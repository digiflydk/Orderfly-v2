
'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Brand, GeneralSettings } from '@/types';
import type { WebsiteHeaderConfig } from '@/types/website';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import SiteLogo from '../common/SiteLogo';

type NavLink = {
  label: string;
  href: string;
  type?: "default" | "primary" | "secondary";
};

type Props = {
  brand?: Brand | null;
  settings?: GeneralSettings | null;
  config?: WebsiteHeaderConfig | null;
  navLinks?: NavLink[];
  linkClass?: string;
  logoUrl?: string | null;
  logoAlt?: string;
};

export function Header({ brand, settings, config, navLinks, linkClass, logoUrl, logoAlt }: Props) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  const effectiveNavLinks: NavLink[] = navLinks || settings?.headerNavLinks || (brand ? [{label: 'Bestil', href: `/${brand.slug}`} ] : []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  
  const finalLogoUrl = logoUrl || brand?.logoUrl;
  const finalLogoAlt = logoAlt || brand?.name || "Orderfly Logo";
  const finalLinkClass = linkClass || 'text-foreground hover:text-primary';

  return (
    <header data-header>
      <div className="mx-auto flex h-16 max-w-[1140px] items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          {finalLogoUrl ? (
            <div
              className="relative h-9 shrink-0"
              style={{ width: `${Math.min(config?.logoWidthPx ?? 164, 164)}px` }}
            >
                <Image
                  src={finalLogoUrl}
                  alt={finalLogoAlt}
                  fill
                  sizes="164px"
                  className="object-contain object-left"
                  priority
                />
            </div>
          ) : (
            <SiteLogo />
          )}
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {effectiveNavLinks.map((link: NavLink) => (
            <Link key={link.label} href={link.href} className={cn('text-sm', finalLinkClass)}>
              {link.label}
            </Link>
          ))}
        </nav>

        <button type="button" onClick={() => setMenuOpen(value => !value)} aria-expanded={menuOpen} aria-controls="storefront-mobile-navigation" className={cn('md:hidden text-sm', finalLinkClass)} aria-label="Open menu">
          Menu
        </button>
      </div>
      {menuOpen && <nav id="storefront-mobile-navigation" aria-label="Mobilmenu" className="md:hidden border-t bg-background p-4 flex flex-col gap-4">
        {effectiveNavLinks.map(link => <Link key={link.label} href={link.href} onClick={() => setMenuOpen(false)} className="text-foreground">{link.label}</Link>)}
      </nav>}
    </header>
  );
}
