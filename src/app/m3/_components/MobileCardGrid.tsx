import Image from "next/image";
import { Button } from "@/components/ui/button";

const cards = [
  {
    title: "Byg din egen pizza",
    description: "Vælg mellem alle vores ingredienser",
    imageUrl: "https://picsum.photos/seed/m3card1/400/300",
    aiHint: "pizza ingredients",
    cta: "Byg selv",
  },
  {
    title: "M3 Point",
    description: "Optjen point og få rabatter",
    imageUrl: "https://picsum.photos/seed/m3card2/400/300",
    aiHint: "loyalty points",
    cta: "Læs mere",
  },
  {
    title: "M3 Plus",
    description: "Spar op til 50% som medlem",
    imageUrl: "https://picsum.photos/seed/m3card3/400/300",
    aiHint: "membership card",
    cta: "Læs mere",
  },
  {
    title: "M3ToGo",
    description: "Bestil online, leveret til din adresse",
    imageUrl: "https://picsum.photos/seed/m3card4/400/300",
    aiHint: "delivery scooter",
    cta: "Bestil nu",
  },
  {
    title: "Se menukort",
    description: "Udforsk vores store udvalg",
    imageUrl: "https://picsum.photos/seed/m3card5/400/300",
    aiHint: "restaurant menu",
    cta: "Se menu",
  },
  {
    title: "Børnemenu",
    description: "Plant et træ med hver børnemenu",
    imageUrl: "https://picsum.photos/seed/m3card6/400/300",
    aiHint: "child planting",
    cta: "Læs mere",
  },
];

export function MobileCardGrid() {
  return (
    <section className="p-4 bg-m3-cream">
      <div className="grid grid-cols-2 gap-4">
        {cards.map((card) => (
          <div key={card.title} className="bg-white rounded-lg shadow-sm overflow-hidden flex flex-col">
            <div className="relative aspect-[4/3]">
              <Image
                src={card.imageUrl}
                alt={card.title}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover"
                data-ai-hint={card.aiHint}
              />
            </div>
            <div className="p-3 flex flex-col flex-grow">
              <h3 className="font-bold text-sm text-m3-dark">{card.title}</h3>
              <p className="text-xs text-m3-dark/70 mt-1 flex-grow">{card.description}</p>
              <Button
                size="sm"
                className="mt-3 w-full bg-m3-orange text-m3-dark hover:bg-m3-orange/90 font-bold uppercase text-xs px-4 py-2 rounded-lg"
              >
                {card.cta}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
