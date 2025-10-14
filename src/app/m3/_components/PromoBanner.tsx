import Image from "next/image";
import { Button } from "@/components/ui/button";
import { promoBannerContent } from "../_data/constants";

export function PromoBanner() {
  return (
    <section className="container mx-auto px-4 py-8">
      <div className="relative h-[380px] overflow-hidden rounded-lg group cursor-pointer shadow-xl">
        <Image
          src={promoBannerContent.imageUrl}
          alt={promoBannerContent.title}
          fill
          sizes="100vw"
          className="object-cover brightness-90 group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 p-8 md:p-12 text-white">
          <h3 className="text-4xl font-bold mb-4 uppercase leading-tight max-w-md">
            {promoBannerContent.title}
          </h3>
          <p className="text-base mb-6 max-w-md leading-relaxed opacity-90">
            {promoBannerContent.description}
          </p>
          <Button className="bg-secondary hover:bg-secondary/90 text-black rounded-md px-8 py-3 text-xs uppercase font-bold tracking-wide">
            {promoBannerContent.ctaText}
          </Button>
        </div>
      </div>
    </section>
  );
}
