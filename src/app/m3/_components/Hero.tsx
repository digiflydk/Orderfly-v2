import Image from "next/image";
import { Button } from "@/components/ui/button";
import { heroContent } from "../_data/constants";

export function Hero() {
  return (
    <section className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8">
      <div className="relative h-[420px] overflow-hidden rounded-2xl shadow-lg">
        <Image
          src={heroContent.imageUrl}
          alt={heroContent.title}
          fill
          sizes="(max-width: 1200px) 100vw, 1200px"
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />

        <div className="relative h-full flex items-center p-8 md:p-12">
          <div className="max-w-xl text-white">
            <div className="inline-block bg-primary text-primary-foreground px-4 py-2 rounded text-xs mb-6 uppercase font-bold tracking-wider">
              {heroContent.badge}
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold uppercase leading-tight mb-6">
              {heroContent.title}
            </h1>
            <p className="text-base sm:text-lg mb-8 leading-relaxed opacity-90">
              {heroContent.description}
            </p>
            <Button
              size="lg"
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold uppercase tracking-wide transition-all"
            >
              {heroContent.ctaText}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
