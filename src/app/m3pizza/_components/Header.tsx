"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

interface NavItem {
  label: string;
  href: string;
}

interface HeaderProps {
  logoUrl: string | null;
  navItems: NavItem[];
  orderHref: string;
  onOrderClick: () => void;
}

export default function Header({ logoUrl, navItems, onOrderClick }: HeaderProps) {
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
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled ? "bg-m3-cream shadow-md" : "bg-transparent"
      }`}
    >
      <div className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 flex items-center justify-between h-20">
        <Link href="/m3pizza" className="z-50">
          {logoUrl ? (
            <Image src={logoUrl} alt="M3 Pizza" width={80} height={40} priority data-ai-hint="logo" />
          ) : (
            <span className="font-bold text-xl">M3Pizza</span>
          )}
        </Link>
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <Link key={item.label} href={item.href} className="text-sm font-semibold hover:text-m3-orange transition-colors">{item.label}</Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <Button
            onClick={onOrderClick}
            className="hidden md:flex bg-m3-button hover:bg-m3-buttonHover text-[#2D2D2D] rounded-full font-bold uppercase text-sm px-8 py-3 transition-colors">
            Bestil nu
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
            {navItems.map((item) => (
              <Link key={item.label} href={item.href} className="text-xl font-semibold hover:text-m3-orange transition-colors" onClick={() => setIsMenuOpen(false)}>{item.label}</Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
