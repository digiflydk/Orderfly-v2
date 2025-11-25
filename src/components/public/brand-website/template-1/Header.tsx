'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export type Template1HeaderProps = {
  logoUrl: string | null;
  navItems: Array<{ label: string; href: string }>;
  orderHref: string;
};

function DesktopHeader({ logoUrl, navItems, orderHref }: Template1HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-50 transition-all duration-300',
        isScrolled ? 'bg-m3-cream shadow-md' : 'bg-transparent'
      )}
    >
      <div className="container mx-auto flex h-20 max-w-[1200px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/m3pizza">
          {logoUrl ? (
            <Image src={logoUrl} alt="Brand Logo" width={80} height={40} priority data-ai-hint="logo" />
          ) : (
            <span className="font-bold text-xl">Brand</span>
          )}
        </Link>
        <nav className="flex items-center gap-8">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href} className="text-sm font-semibold hover:text-m3-orange transition-colors">
              {item.label}
            </Link>
          ))}
        </nav>
        <Button asChild className="rounded-full bg-m3-button px-8 py-3 text-sm font-bold uppercase text-[#2D2D2D] transition-colors hover:bg-m3-buttonHover">
          <a href={orderHref}>Order now</a>
        </Button>
      </div>
    </header>
  );
}

function MobileHeader({ logoUrl, navItems, orderHref }: Template1HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-m3-gray bg-m3-cream px-4">
        <Link href="/m3pizza">
          {logoUrl ? (
            <Image src={logoUrl} alt="Brand Logo" width={70} height={35} priority data-ai-hint="logo" />
          ) : (
            <span className="font-bold">Brand</span>
          )}
        </Link>
        <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="bg-m3-cream">
            <nav className="mt-10 flex flex-col items-center gap-8">
              {navItems.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="text-xl font-semibold hover:text-m3-orange transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
      </header>
      {/* Sticky Bottom CTA */}
      <div className="h-14" aria-hidden="true" /> {/* Spacer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-m3-cream pb-[max(env(safe-area-inset-bottom),0px)]">
        <Button asChild size="lg" className="h-14 w-full rounded-none bg-m3-orange text-base font-bold uppercase text-m3-dark hover:bg-m3-orange/90">
          <a href={orderHref}>Order now</a>
        </Button>
      </div>
    </>
  );
}

export function Header(props: Template1HeaderProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <MobileHeader {...props} />;
  }
  return <DesktopHeader {...props} />;
}
