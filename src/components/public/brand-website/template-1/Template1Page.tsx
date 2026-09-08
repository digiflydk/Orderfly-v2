'use client';
import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { Brand, BrandWebsiteConfig } from '@/types';
import { Header } from '@/components/layout/header';
import type { WebsiteHeaderConfig } from '@/types/website';
import M3Footer from '@/components/layout/M3Footer';
export interface Template1PageProps {
  children: React.ReactNode; brand?: Brand; config?: BrandWebsiteConfig | null; onOrderClick?: () => void; onCookieSettings?: () => void;
  headerProps?: {header: WebsiteHeaderConfig; orderHref: string; ctaText: string; navLinks?: {label: string; href: string}[]};
  footerProps?: unknown;
}
export function Template1Page({children, brand, onOrderClick, config, onCookieSettings, headerProps}: Template1PageProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const order = onOrderClick || (() => router.push(headerProps?.orderHref || `/${brand?.slug || ''}`));
  if (!brand) return <div>{headerProps && <Header config={headerProps.header} navLinks={[...(headerProps.navLinks || []), {label: headerProps.ctaText, href: headerProps.orderHref}]} />}<main>{children}</main></div>;
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
    <M3Footer brand={brand} config={config} onOrderClick={order} onCookieSettings={onCookieSettings} />
  </div>;
}
