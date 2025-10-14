import { Facebook, Instagram, Mail, Twitter } from 'lucide-react';

export function Footer() {
  return (
    <footer className="bg-foreground text-background py-16 mt-20">
      <div className="mx-auto max-w-[1280px] px-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-secondary via-primary to-primary flex items-center justify-center">
                <span className="text-foreground text-[16px]" style={{ fontWeight: 700 }}>M3</span>
              </div>
              <h3 className="text-[20px]" style={{ fontWeight: 700 }}>M3 Pizza</h3>
            </div>
            <p className="text-background/80 text-[14px]">
              Moderne dansk pizza med passion for kvalitet og smag.
            </p>
          </div>
          <div>
            <h4 className="text-[16px] mb-4 uppercase tracking-wide" style={{ fontWeight: 700 }}>Menu</h4>
            <ul className="space-y-2 text-[14px]">
              <li><a href="#" className="text-background/80 hover:text-secondary transition-colors">Alle pizzaer</a></li>
              <li><a href="#" className="text-background/80 hover:text-secondary transition-colors">Byg din egen</a></li>
              <li><a href="#" className="text-background/80 hover:text-secondary transition-colors">Plant-Based</a></li>
              <li><a href="#" className="text-background/80 hover:text-secondary transition-colors">Børnemenu</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[16px] mb-4 uppercase tracking-wide" style={{ fontWeight: 700 }}>Medlemskab</h4>
            <ul className="space-y-2 text-[14px]">
              <li><a href="#" className="text-background/80 hover:text-secondary transition-colors">M3Point</a></li>
              <li><a href="#" className="text-background/80 hover:text-secondary transition-colors">M3Plus</a></li>
              <li><a href="#" className="text-background/80 hover:text-secondary transition-colors">Bliv medlem</a></li>
              <li><a href="#" className="text-background/80 hover:text-secondary transition-colors">Mine fordele</a></li>
            </ul>
          </div>
          <div>
            <h4 className="text-[16px] mb-4 uppercase tracking-wide" style={{ fontWeight: 700 }}>Følg os</h4>
            <div className="flex gap-4 mb-6">
              <a href="#" className="text-background/80 hover:text-secondary transition-colors">
                <Facebook className="h-5 w-5" />
              </a>
              <a href="#" className="text-background/80 hover:text-secondary transition-colors">
                <Instagram className="h-5 w-5" />
              </a>
              <a href="#" className="text-background/80 hover:text-secondary transition-colors">
                <Twitter className="h-5 w-5" />
              </a>
              <a href="#" className="text-background/80 hover:text-secondary transition-colors">
                <Mail className="h-5 w-5" />
              </a>
            </div>
            <ul className="space-y-2 text-[14px]">
              <li><a href="#" className="text-background/80 hover:text-secondary transition-colors">Om M3</a></li>
              <li><a href="#" className="text-background/80 hover:text-secondary transition-colors">Kontakt</a></li>
              <li><a href="#" className="text-background/80 hover:text-secondary transition-colors">Job</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-background/20 pt-8 text-center">
          <p className="text-background/80 text-[13px]">© 2025 M3 Pizza. Alle rettigheder forbeholdes.</p>
          <div className="flex justify-center gap-6 mt-4">
            <a href="#" className="text-background/80 hover:text-secondary text-[12px] transition-colors">Privatlivspolitik</a>
            <a href="#" className="text-background/80 hover:text-secondary text-[12px] transition-colors">Handelsbetingelser</a>
            <a href="#" className="text-background/80 hover:text-secondary text-[12px] transition-colors">Cookiepolitik</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
