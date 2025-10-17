import Image from "next/image";
import { Button } from "@/components/ui/button";
import { promoBannerContent } from "../_data/constants";

export function PromoBanner() {
  return (
    <section className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8">
      <div className="relative h-[380px] overflow-hidden rounded-2xl group cursor-pointer shadow-lg">
        <Image
          src={promoBannerContent.imageUrl}
          alt={promoBannerContent.title}
          fill
          sizes="(max-width: 1200px) 100vw, 1200px"
          className="object-cover brightness-75 group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 p-8 md:p-12 text-m3-white">
          <h3 className="text-3xl lg:text-4xl font-bold mb-4 uppercase leading-tight max-w-md">
            {promoBannerContent.title}
          </h3>
          <p className="text-base mb-6 max-w-md leading-relaxed opacity-90">
            {promoBannerContent.description}
          </p>
          <Button className="bg-m3-button hover:bg-m3-buttonHover text-[#2D2D2D] rounded-md px-8 py-3 text-xs uppercase font-bold tracking-wide transition-colors">
            {promoBannerContent.ctaText}
          </Button>
        </div>
      </div>
    </section>
  );
}
