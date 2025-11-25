'use client';

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerTrigger, DrawerClose } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export type Template1HeaderProps = {
  logoUrl: string | null;
  logoAlt?: string;
  navItems: Array<{ label: string; href: string }>;
  orderHref: string;
};

export function Header({ logoUrl, logoAlt, navItems, orderHref }: Template1HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <>
      <header
        className={cn(
            "sticky top-0 z-50 transition-colors duration-300",
            isScrolled ? "bg-[var(--template1-color-header-bg)] shadow-md" : "bg-transparent"
        )}
      >
        <div className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 flex items-center justify-between h-20">
          <Link href="/" className="z-50">
            {logoUrl ? (
                <Image src={logoUrl} alt={logoAlt || "Brand Logo"} width={120} height={40} priority data-ai-hint="logo" />
            ) : (
                <span className="text-2xl font-bold">{logoAlt || "Brand"}</span>
            )}
          </Link>
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map(item => (
                <Link key={item.label} href={item.href} className="text-sm font-semibold text-[var(--template1-color-text-primary)] hover:text-[var(--template1-color-primary)] transition-colors">{item.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <Button
              asChild
              className="hidden md:flex bg-[var(--template1-color-primary)] hover:bg-[var(--template1-color-primary)]/90 text-primary-foreground rounded-full font-bold uppercase text-sm px-8 py-3 transition-colors"
            >
              <a href={orderHref}>Bestil nu</a>
            </Button>
            <Drawer open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                 <DrawerTrigger asChild>
                    <button
                        className="md:hidden z-50 text-[var(--template1-color-text-primary)]"
                        aria-label="Toggle menu"
                    >
                        {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                 </DrawerTrigger>
                 <DrawerContent className="bg-[var(--template1-color-background)]">
                    <DrawerHeader className="text-left">
                        <DrawerTitle>Menu</DrawerTitle>
                    </DrawerHeader>
                    <nav className="flex flex-col items-start gap-8 p-4">
                        {navItems.map(item => (
                            <DrawerClose asChild key={item.label}>
                                <Link href={item.href} className="text-xl font-semibold hover:text-[var(--template1-color-primary)] transition-colors">{item.label}</Link>
                            </DrawerClose>
                        ))}
                    </nav>
                 </DrawerContent>
            </Drawer>
          </div>
        </div>
      </header>

      {/* Sticky mobile CTA */}
       <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 p-4 bg-transparent pointer-events-none">
            <Button
              asChild
              size="lg"
              className="w-full bg-[var(--template1-color-primary)] hover:bg-[var(--template1-color-primary)]/90 text-primary-foreground font-bold uppercase pointer-events-auto"
            >
              <a href={orderHref}>Bestil nu</a>
            </Button>
      </div>
       <div className="h-20 md:hidden" />
    </>
  );
}
