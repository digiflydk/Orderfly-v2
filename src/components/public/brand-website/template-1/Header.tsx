
'use client';
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import { usePathname } from 'next/navigation';
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { cn } from "@/lib/utils";

export type Template1HeaderProps = {
  logoUrl: string | null;
  navItems: Array<{ label: string; href: string }>;
  orderHref: string;
};

function StickyMobileCTA({ orderHref }: { orderHref: string }) {
    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black via-black/80 to-transparent z-40">
             <Button asChild size="lg" className="w-full">
                <Link href={orderHref}>Bestil nu</Link>
            </Button>
        </div>
    )
}

export function Header({ logoUrl, navItems, orderHref }: Template1HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  
  useEffect(() => {
      setIsMenuOpen(false);
  }, [pathname]);

  return (
    <>
      <header
        className={cn(
            "sticky top-0 z-50 transition-all duration-300",
            isScrolled ? "bg-black/80 backdrop-blur-sm shadow-lg" : "bg-transparent"
        )}
      >
        <div className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 flex items-center justify-between h-20">
          <Link href="/" className="z-50 text-white font-bold text-2xl">
            {logoUrl ? (
                <Image src={logoUrl} alt="Brand Logo" width={90} height={45} priority data-ai-hint="logo" />
            ) : "Brand"}
          </Link>
          
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map(item => (
                <Link key={item.label} href={item.href} className="text-sm font-semibold text-gray-300 hover:text-white transition-colors">{item.label}</Link>
            ))}
          </nav>
          
          <div className="flex items-center gap-4">
             <Button asChild className="hidden md:flex">
                <Link href={orderHref}>Bestil nu</Link>
            </Button>
            <div className="md:hidden">
              <Drawer open={isMenuOpen} onOpenChange={setIsMenuOpen} direction="right">
                <DrawerTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Toggle menu">
                    <Menu size={24} className="text-white" />
                  </Button>
                </DrawerTrigger>
                <DrawerContent className="bg-black text-white p-6 h-full w-[80vw] max-w-sm">
                   <nav className="flex flex-col items-start gap-8 mt-16">
                     {navItems.map(item => (
                        <Link key={item.label} href={item.href} className="text-xl font-semibold hover:text-primary transition-colors">{item.label}</Link>
                    ))}
                  </nav>
                </DrawerContent>
              </Drawer>
            </div>
          </div>
        </div>
      </header>
      <StickyMobileCTA orderHref={orderHref} />
    </>
  );
}
