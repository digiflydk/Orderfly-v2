
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { PromotionTile } from '@/lib/storefront-promotion';
import { safeImage } from '@/lib/images';

export function PromoBanner({promotion, onOrderClick}: {promotion?: PromotionTile; onOrderClick: () => void}) {
  if (!promotion) return null;
  return (
    <section className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8">
      <div className="relative h-[380px] overflow-hidden group cursor-pointer shadow-lg">
        <Image
          src={safeImage(promotion.imageUrl)}
          alt={promotion.title}
          fill
          sizes="(max-width: 1200px) 100vw, 1200px"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 p-8 md:p-12 text-m3-white">
          <h3 className="text-3xl lg:text-4xl font-bold mb-4 uppercase leading-tight max-w-md">
            {promotion.title}
          </h3>
          <p className="text-base mb-6 max-w-md leading-relaxed opacity-90">
            {promotion.description}
          </p>
          <Button onClick={onOrderClick} className="bg-m3-button hover:bg-m3-buttonHover text-[#2D2D2D] rounded-md px-8 py-3 text-xs uppercase font-bold tracking-wide transition-colors">
            Se tilbud i menuen
          </Button>
        </div>
      </div>
    </section>
  );
}
