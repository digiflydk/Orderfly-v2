
'use client';
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import type { WebsiteHeaderConfig } from "@/types/website";
import { cn } from "@/lib/utils";

interface HeaderProps {
  header: WebsiteHeaderConfig;
  logoUrl?: string | null;
  ctaText: string;
  orderHref: string;
}

export function Header({ header, logoUrl, ctaText, orderHref }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const headerClasses = cn(
    "transition-all duration-300",
    header.sticky ? "sticky top-0 z-50" : "",
    isScrolled ? "bg-m3-cream shadow-md" : "bg-transparent"
  );

  return (
    <header data-testid="template1-header" className={headerClasses} style={{ height: `${header.heightPx}px` }}>
      <div className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 flex items-center justify-between h-full">
        <Link href="/m3pizza" className="z-50">
           {logoUrl ? (
             <Image src={logoUrl} alt="Brand Logo" width={header.logoWidthPx} height={header.heightPx / 2} priority data-ai-hint="logo" style={{height: 'auto'}}/>
           ) : (
             <span className="font-bold text-lg">M3Pizza</span>
           )}
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          <Link href="#" className={cn("text-sm font-semibold", header.linkClass)}>Menu</Link>
          <Link href="#" className={cn("text-sm font-semibold", header.linkClass)}>Byg selv</Link>
          <Link href="#" className={cn("text-sm font-semibold", header.linkClass)}>Rewards</Link>
          <Link href="#" className={cn("text-sm font-semibold", header.linkClass)}>Kontakt</Link>
        </nav>
        <div className="flex items-center gap-4">
          <Button
            asChild
            className="hidden md:flex bg-m3-button hover:bg-m3-buttonHover text-[#2D2D2D] rounded-full font-bold uppercase text-sm px-8 py-3 transition-colors">
            <Link href={orderHref}>
                {ctaText}
            </Link>
          </Button>
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
            <Link href="#" className="text-xl font-semibold hover:text-m3-orange transition-colors" onClick={() => setIsMenuOpen(false)}>Menu</Link>
            <Link href="#" className="text-xl font-semibold hover:text-m3-orange transition-colors" onClick={() => setIsMenuOpen(false)}>Byg selv</Link>
            <Link href="#" className="text-xl font-semibold hover:text-m3-orange transition-colors" onClick={() => setIsMenuOpen(false)}>Rewards</Link>
            <Link href="#" className="text-xl font-semibold hover:text-m3-orange transition-colors" onClick={() => setIsMenuOpen(false)}>Kontakt</Link>
          </nav>
          <Button
            asChild
            onClick={() => setIsMenuOpen(false)}
            className="bg-m3-button hover:bg-m3-buttonHover text-[#2D2D2D] rounded-full font-bold uppercase text-sm px-8 py-3 transition-colors mt-8">
            <Link href={orderHref}>
                {ctaText}
            </Link>
          </Button>
        </div>
      )}
    </header>
  );
}
