import Image from "next/image";

const cards = [
  {
    title: "Byg din egen pizza",
    imageUrl: "https://picsum.photos/seed/m3card1/400/500",
    aiHint: "pizza ingredients",
  },
  {
    title: "M3 Point",
    imageUrl: "https://picsum.photos/seed/m3card2/400/500",
    aiHint: "loyalty points",
  },
  {
    title: "M3 Plus",
    imageUrl: "https://picsum.photos/seed/m3card3/400/500",
    aiHint: "membership card",
  },
  {
    title: "M3ToGo",
    imageUrl: "https://picsum.photos/seed/m3card4/400/500",
    aiHint: "delivery scooter",
  },
  {
    title: "Se menukort",
    imageUrl: "https://picsum.photos/seed/m3card5/400/500",
    aiHint: "restaurant menu",
  },
  {
    title: "Børnemenu",
    imageUrl: "https://picsum.photos/seed/m3card6/400/500",
    aiHint: "child planting",
  },
];

export function MobileCardGrid() {
  return (
    <section className="bg-m3-cream">
      <div className="grid grid-cols-2 gap-4">
        {cards.map((card) => (
          <div key={card.title} className="bg-white shadow-sm overflow-hidden flex flex-col">
            <div className="relative aspect-[4/5]">
              <Image
                src={card.imageUrl}
                alt={card.title}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover"
                data-ai-hint={card.aiHint}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
