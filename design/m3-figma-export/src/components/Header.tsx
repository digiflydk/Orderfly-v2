import { ShoppingCart } from 'lucide-react';
import { Button } from './ui/button';
import { useEffect, useState } from 'react';

interface HeaderProps {
  onNavigateToMenu?: () => void;
}

export function Header({ onNavigateToMenu }: HeaderProps) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      className="sticky top-0 z-50 bg-background transition-all duration-300"
      style={{
        boxShadow: isScrolled ? '0 2px 6px rgba(0,0,0,0.05)' : 'none'
      }}
    >
      <div className={`mx-auto max-w-[1280px] px-10 flex items-center justify-between transition-all duration-300 ${
        isScrolled ? 'h-[72px]' : 'h-[88px]'
      }`}>
        {/* Logo */}
        <div className="flex items-center">
          <div 
            className={`rounded-full bg-gradient-to-br from-secondary via-primary to-[#00CED1] flex items-center justify-center transition-all duration-300 ${
              isScrolled ? 'w-10 h-10' : 'w-14 h-14'
            }`}
          >
            <span 
              className={`text-[#000000] transition-all duration-300 ${
                isScrolled ? 'text-[16px]' : 'text-[22px]'
              }`} 
              style={{ fontWeight: 700 }}
            >
              M3
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-8 flex-1 justify-center">
          <a href="#menu" className="text-foreground hover:text-primary transition-colors text-[14px]">
            Menukort
          </a>
          <a href="#medlemskab" className="text-foreground hover:text-primary transition-colors text-[14px]">
            Medlemskab
          </a>
          <a href="#find-restaurant" className="text-foreground hover:text-primary transition-colors text-[14px]">
            Find Restaurant
          </a>
          <a href="#job" className="text-foreground hover:text-primary transition-colors text-[14px]">
            Job
          </a>
          <a href="#om" className="text-foreground hover:text-primary transition-colors text-[14px]">
            Om M3
          </a>
          <a href="#kontakt" className="text-foreground hover:text-primary transition-colors text-[14px]">
            Kontakt Os
          </a>
        </nav>

        {/* CTA Button - 15% larger */}
        <div className="flex items-center">
          <Button 
            onClick={onNavigateToMenu}
            className={`bg-secondary hover:bg-secondary/90 text-[#2D2D2D] rounded-full uppercase tracking-wide transition-all duration-300 ${
              isScrolled ? 'px-8 py-5 text-[13px]' : 'px-10 py-6 text-[14px]'
            }`} 
            style={{ fontWeight: 700 }}
          >
            Bestil her
            <span className={`ml-3 transition-all duration-300 ${isScrolled ? 'text-[18px]' : 'text-[20px]'}`}>🍕</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
