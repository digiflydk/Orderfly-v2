import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ctaDeckContent } from "../_data/constants";

function CTAFullWidthCard({
  title,
  description,
  imageUrl,
  ctaText,
}: {
  title: string;
  description: string;
  imageUrl: string;
  ctaText: string;
}) {
  return (
    <div className="relative h-[340px] overflow-hidden rounded-lg group cursor-pointer shadow-lg">
      <Image
        src={imageUrl}
        alt={title}
        fill
        sizes="(max-width: 768px) 100vw, 50vw"
        className="object-cover brightness-75 group-hover:scale-105 transition-transform duration-500"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
      <div className="absolute bottom-0 left-0 p-8 text-white">
        <h3 className="text-3xl font-bold mb-3 uppercase leading-tight">
          {title}
        </h3>
        <p className="text-sm mb-4 max-w-md opacity-80">
          {description}
        </p>
        <Button className="bg-secondary hover:bg-secondary/90 text-black rounded-md px-8 py-3 text-xs uppercase font-bold tracking-wide">
          {ctaText}
        </Button>
      </div>
    </div>
  );
}

export function CTADeck() {
  return (
    <section className="container mx-auto px-4 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CTAFullWidthCard
          title={ctaDeckContent.m3point.title}
          description={ctaDeckContent.m3point.description}
          imageUrl={ctaDeckContent.m3point.imageUrl}
          ctaText={ctaDeckContent.m3point.ctaText}
        />
        <CTAFullWidthCard
          title={ctaDeckContent.m3plus.title}
          description={ctaDeckContent.m3plus.description}
          imageUrl={ctaDeckContent.m3plus.imageUrl}
          ctaText={ctaDeckContent.m3plus.ctaText}
        />
      </div>
    </section>
  );
}
