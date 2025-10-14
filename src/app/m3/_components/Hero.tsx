import Image from "next/image";
import { Button } from "@/components/ui/button";
import { heroContent } from "../_data/constants";

export function Hero() {
  return (
    <section className="relative h-[420px] w-full">
      <Image
        src={heroContent.imageUrl}
        alt={heroContent.title}
        fill
        sizes="100vw"
        className="object-cover"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />

      <div className="relative h-full flex items-center container mx-auto px-4">
        <div className="max-w-xl text-white">
          <div className="inline-block bg-secondary text-secondary-foreground px-4 py-2 rounded text-xs mb-6 uppercase font-bold tracking-wider">
            {heroContent.badge}
          </div>
          <h1 className="text-5xl lg:text-6xl font-bold uppercase leading-tight mb-6">
            {heroContent.title}
          </h1>
          <p className="text-lg mb-8 leading-relaxed">
            {heroContent.description}
          </p>
          <Button size="lg" className="bg-secondary hover:bg-secondary/90 text-black font-bold uppercase tracking-wide">
            {heroContent.ctaText}
          </Button>
        </div>
      </div>
    </section>
  );
}
