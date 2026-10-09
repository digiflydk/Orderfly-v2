'use client';
import type { StorefrontLinks } from '@/lib/storefront-types';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { Brand } from '@/types';
import StorefrontFooter from './StorefrontFooter';
export interface StandardStorefrontProps {
  children: React.ReactNode; brand: Brand; config?: StorefrontLinks | null; onOrderClick: () => void; onCookieSettings?: () => void;
}
export function StandardStorefront({children, brand, onOrderClick, config, onCookieSettings}: StandardStorefrontProps) {
  const [open, setOpen] = useState(false);
  const order = onOrderClick;
  return <div data-commerce-root className="bg-m3-cream min-h-screen text-m3-dark">
    <header data-testid="template1-header" className="sticky top-0 z-50 bg-m3-cream shadow-md" onKeyDown={event => {if (event.key === 'Escape') setOpen(false);}}>
      <div className="mx-auto max-w-[1200px] px-4 h-20 flex items-center justify-between gap-4">
        <Link href="/" aria-label={brand.name}>{brand.logoUrl ? <Image src={brand.logoUrl} alt={brand.name} width={120} height={48} sizes="120px" className="h-12 w-28 object-contain" /> : brand.name}</Link>
        <nav className="hidden md:flex gap-6"><Link href="#menu">Menu</Link><button onClick={order}>Bestil</button></nav>
        <div className="flex gap-2"><Button onClick={order}>Bestil nu</Button>
          <Button variant="outline" className="md:hidden" aria-expanded={open} aria-controls="landing-navigation" onClick={() => setOpen(!open)}>Menu</Button></div>
      </div>
      {open && <nav id="landing-navigation" className="md:hidden p-4 border-t flex flex-col gap-4">
        <Link href="#menu" onClick={() => setOpen(false)}>Se menuen</Link>
        <button onClick={() => {setOpen(false); order();}}>Bestil</button>
      </nav>}
    </header>
    <main>{children}</main>
    <StorefrontFooter brand={brand} config={config} onOrderClick={order} onCookieSettings={onCookieSettings} />
  </div>;
}
