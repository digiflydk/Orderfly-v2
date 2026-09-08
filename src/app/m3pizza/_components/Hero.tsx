
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

import type { ProductForMenu } from '@/types';
import { safeImage } from '@/lib/images';

interface HeroProps {
  onOrderClick: () => void;
  brandName: string;
  products: ProductForMenu[];
}

export function Hero({ onOrderClick, brandName, products }: HeroProps) {
  const heroSlides = products.slice(0, 3).map(product => ({badge: brandName, title: product.productName,
    description: product.description || 'Se menuen og vælg dine favoritter.', imageUrl: safeImage(product.imageUrl), ctaText: 'Bestil nu'}));
  if (!heroSlides.length) heroSlides.push({badge: brandName, title: brandName, description: 'Se menuen og vælg dine favoritter.', imageUrl: safeImage(''), ctaText: 'Se menuen'});
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev === heroSlides.length - 1 ? 0 : prev + 1));
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev === 0 ? heroSlides.length - 1 : prev - 1));
  };

  useEffect(() => {
    const slideInterval = setInterval(nextSlide, 5000);
    return () => clearInterval(slideInterval);
  }, [heroSlides.length]);

  const slide = heroSlides[currentSlide] || heroSlides[0];

  return (
    <section className="container mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8 py-8">
      <div className="relative h-[420px] overflow-hidden shadow-lg">
        <AnimatePresence initial={false}>
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -300 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0"
          >
            <Image
              src={slide.imageUrl}
              alt={slide.title}
              fill
              sizes="(max-width: 1200px) 100vw, 1200px"
              className="object-cover"
              priority={currentSlide === 0}
            />
             <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
          </motion.div>
        </AnimatePresence>

        <div className="relative h-full flex items-center p-8 md:p-12">
          <div className="max-w-xl text-m3-white z-10">
            <div className="inline-block bg-m3-purple text-m3-white px-4 py-2 rounded text-xs mb-6 uppercase font-bold tracking-wider">
              {slide.badge}
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold uppercase leading-tight mb-6">
              {slide.title}
            </h1>
            <p className="text-base sm:text-lg mb-8 leading-relaxed opacity-90">
              {slide.description}
            </p>
            <Button
              onClick={onOrderClick}
              size="lg"
              className="bg-m3-orange hover:bg-m3-orange/90 text-[#2D2D2D] font-bold uppercase tracking-wide transition-all px-10"
            >
              {slide.ctaText}
            </Button>
          </div>
        </div>

        {/* Navigation Controls */}
        <button
          aria-label="Forrige produkt" onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white rounded-full p-2 transition-all"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
        <button
          aria-label="Næste produkt" onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-20 bg-white/10 hover:bg-white/20 backdrop-blur-sm text-white rounded-full p-2 transition-all"
        >
          <ChevronRight className="h-6 w-6" />
        </button>

        {/* Slide Indicators */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-20">
          {heroSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === currentSlide
                  ? "bg-m3-orange w-8"
                  : "bg-white/50 hover:bg-white/80"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
