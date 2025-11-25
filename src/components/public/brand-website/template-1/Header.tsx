'use client';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Template1Button } from './Template1Button';

export type Template1HeaderProps = {
  logoUrl: string | null;
  logoAlt?: string;
  navItems: Array<{ label: string; href: string }>;
  orderHref: string;
  linkClass: string;
};

export function Header({ logoUrl, logoAlt, navItems, orderHref, linkClass }: Template1HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const finalLogoAlt = logoAlt || 'Company Logo';
  const finalLinkClass = linkClass || 'text-white hover:text-primary';

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-m3-cream shadow-md' : 'bg-transparent'
      }`}
    >
      <div className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 flex items-center justify-between h-20">
        <Link href="/m3" className="z-50">
          <Image src={logoUrl ?? "https://i.postimg.cc/PqYpW1s1/logo.png"} alt={finalLogoAlt} width={80} height={40} priority data-ai-hint="logo" />
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map(item => (
             <Link key={item.label} href={item.href} className={cn('text-sm font-semibold transition-colors', finalLinkClass)}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Template1Button
            href={orderHref}
            variant="primary"
            className="hidden md:flex"
          >
            Bestil her
          </Template1Button>
          <button
            className="md:hidden z-50"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>
      {/* Mobile Menu */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-0 left-0 w-full h-screen bg-m3-cream flex flex-col items-center justify-center gap-8">
          <nav className="flex flex-col items-center gap-8">
             {navItems.map(item => (
                <Link key={item.label} href={item.href} className={cn("text-xl font-semibold transition-colors", finalLinkClass)} onClick={() => setIsMenuOpen(false)}>
                    {item.label}
                </Link>
            ))}
          </nav>
          <Template1Button 
            href={orderHref}
            variant="primary"
            className="mt-8"
            onClick={() => setIsMenuOpen(false)}
            >
            Bestil her
          </Template1Button>
        </div>
      )}
    </header>
  );
}
