
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { ProductForMenu } from '@/types';
import { safeImage } from '@/lib/images';
import { money } from '@/lib/money';

function PizzaCard({
  name,
  description,
  price,
  imageUrl,
  onOrderClick,
}: {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  onOrderClick: () => void;
}) {
  return (
    <div className="relative h-96 overflow-hidden group cursor-pointer shadow-md hover:shadow-xl transition-shadow">
      <Image
        src={imageUrl}
        alt={name}
        fill
        sizes="(max-width: 768px) 50vw, 33vw"
        className="object-cover group-hover:scale-105 transition-transform duration-500"
      />
      <div className="absolute bottom-0 left-0 p-6 w-full text-m3-white">
        <h3 className="text-2xl font-bold mb-2 uppercase leading-tight">
          {name}
        </h3>
        <p className="text-sm mb-4 opacity-90">{description}</p>
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold">Fra {price.toFixed(2)} kr.</span>
          <Button
            onClick={onOrderClick}
            size="sm"
            className="bg-m3-button hover:bg-m3-buttonHover text-[#2D2D2D] rounded-md px-6 py-2 text-xs uppercase font-bold tracking-wide transition-colors"
          >
            Vælg
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MenuGrid({products, modes, onOrderClick}: {products: ProductForMenu[]; modes: string[]; onOrderClick: () => void}) {
  return <section id="menu" className="container mx-auto max-w-[1200px] px-4 py-8 scroll-mt-24">
    <h2 className="text-center text-3xl font-bold mb-8">Fra vores menu</h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {products.slice(0, 9).map(product => {
        const prices = [modes.includes('pickup') ? product.price : undefined, modes.includes('delivery') ? product.priceDelivery ?? product.price : undefined]
          .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0);
        if (!prices.length) return null;
        return <PizzaCard key={product.id} name={product.productName} description={product.description || ''}
          price={money(Math.min(...prices))} imageUrl={safeImage(product.imageUrl)} onOrderClick={onOrderClick} />;
      })}
    </div>
    <div className="text-center mt-8"><Button size="lg" onClick={onOrderClick}>Se hele menuen</Button></div>
  </section>;
}
