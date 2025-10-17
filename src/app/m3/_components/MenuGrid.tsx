import Image from "next/image";
import { Button } from "@/components/ui/button";
import { menuGridContent } from "../_data/constants";

function PizzaCard({
  name,
  description,
  price,
  imageUrl,
}: {
  name: string;
  description: string;
  price: number;
  imageUrl: string;
}) {
  return (
    <div className="relative h-96 overflow-hidden rounded-2xl group cursor-pointer shadow-md hover:shadow-xl transition-shadow">
      <Image
        src={imageUrl}
        alt={name}
        fill
        sizes="(max-width: 768px) 50vw, 33vw"
        className="object-cover group-hover:scale-105 transition-transform duration-500"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent" />
      <div className="absolute bottom-0 left-0 p-6 w-full text-m3-white">
        <h3 className="text-2xl font-bold mb-2 uppercase leading-tight">
          {name}
        </h3>
        <p className="text-sm mb-4 opacity-90">{description}</p>
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold">{price} kr</span>
          <Button
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

export function MenuGrid() {
  return (
    <section className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center mb-12">
        <h2 className="text-3xl lg:text-4xl font-bold uppercase">
          {menuGridContent.title}
        </h2>
        <p className="text-base lg:text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
          {menuGridContent.description}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {menuGridContent.pizzas.slice(0, 9).map((pizza) => (
          <PizzaCard key={pizza.name} {...pizza} />
        ))}
      </div>
      <div className="text-center mt-12">
        <Button size="lg" className="bg-m3-button hover:bg-m3-buttonHover text-[#2D2D2D] uppercase font-bold tracking-wide transition-colors">
          {menuGridContent.ctaText}
        </Button>
      </div>
    </section>
  );
}
