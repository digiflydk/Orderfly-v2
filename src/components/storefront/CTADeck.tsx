
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { PromotionTile } from '@/lib/storefront-promotion';
import { safeImage } from '@/lib/images';

function CTAFullWidthCard({
  title,
  description,
  imageUrl,
  ctaText,
  onOrderClick,
}: {
  title: string;
  description: string;
  imageUrl: string;
  ctaText: string;
  onOrderClick: () => void;
}) {
  return (
    <div className="relative h-[340px] overflow-hidden group cursor-pointer shadow-md hover:shadow-xl transition-shadow">
      <Image
        src={imageUrl}
        alt={title}
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        className="object-cover group-hover:scale-105 transition-transform duration-500"
      />
      <div className="absolute bottom-0 left-0 p-8 text-white">
        <h3 className="text-2xl lg:text-3xl font-bold mb-3 uppercase leading-tight">
          {title}
        </h3>
        <p className="text-sm mb-4 max-w-md opacity-80">{description}</p>
        <Button onClick={onOrderClick} className="bg-m3-button hover:bg-m3-buttonHover text-[#2D2D2D] rounded-md px-8 py-3 text-xs uppercase font-bold tracking-wide transition-colors">
          {ctaText}
        </Button>
      </div>
    </div>
  );
}

export function CTADeck({promotions, onOrderClick}: {promotions: PromotionTile[]; onOrderClick: () => void}) {
  if (!promotions.length) return null;
  return <section className="container mx-auto max-w-[1200px] px-4 py-8" aria-label="Aktuelle tilbud">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{promotions.map(promotion =>
      <CTAFullWidthCard key={promotion.id} title={promotion.title} description={promotion.description}
        imageUrl={safeImage(promotion.imageUrl)} ctaText="Se tilbud i menuen" onOrderClick={onOrderClick} />)}</div>
  </section>;
}
