
'use client';

import { Suspense } from 'react';
import Image from 'next/image';
import { Header } from '@/components/layout/header';
import { Footer } from '@/components/layout/footer';
import type { Brand } from '@/types';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const features = [
  {
    title: "AI-Powered Menu Import",
    description: "Upload a photo of your menu, and our AI will automatically populate your product catalog. Save hours of manual data entry and get your online store running in minutes.",
    imageUrl: "https://picsum.photos/800/600?random=11",
    aiHint: "menu import",
    details: [
      "Optical Character Recognition (OCR) for text extraction.",
      "Intelligent data parsing to distinguish items, prices, and descriptions.",
      "Handles various menu layouts and formats.",
      "Reduces setup time from hours to minutes."
    ]
  },
  {
    title: "Dynamic Upsell Engine",
    description: "Increase your average order value with intelligent upsell suggestions. Our system analyzes cart contents and customer behavior to offer relevant add-ons at the perfect moment.",
    imageUrl: "https://picsum.photos/800/600?random=12",
    aiHint: "upsell engine",
     details: [
      "Rule-based triggers (e.g., 'if burger in cart, offer fries').",
      "Context-aware suggestions that don't disrupt the user flow.",
      "A/B testing capabilities to optimize conversion rates.",
      "Full control over offered products and discount percentages."
    ]
  },
  {
    title: "Automated Loyalty Program",
    description: "Build a loyal customer base without the administrative hassle. Our system automatically tracks customer purchases, calculates loyalty scores, and unlocks rewards.",
    imageUrl: "https://picsum.photos/800/600?random=13",
    aiHint: "loyalty program",
    details: [
      "Points-based system configurable to your business model.",
      "Automated reward distribution and notifications.",
      "Customer segmentation based on loyalty tiers.",
      "Detailed analytics on customer retention and lifetime value."
    ]
  },
    {
    title: "Advanced Analytics & Funnel Tracking",
    description: "Gain deep insights into your customer journey. Track user behavior from the first visit to the final purchase and identify opportunities for optimization and growth.",
    imageUrl: "https://picsum.photos/800/600?random=14",
    aiHint: "analytics dashboard",
     details: [
      "Visual customer funnel from impression to conversion.",
      "Track key metrics like AOV, retention rate, and conversion rates.",
      "Filter data by brand, location, and time period.",
      "Server-side event aggregation for accurate, reliable data."
    ]
  }
];

function FeaturesClientInner() {
  return (
      <main className="py-16 bg-muted/40">
        <div className="container mx-auto max-w-5xl px-4 md:px-6">
            <div className="text-center mb-16">
                <h1 className="text-4xl font-bold tracking-tight">Powerful Features for Growth</h1>
                <p className="mt-4 text-lg text-muted-foreground max-w-3xl mx-auto">
                    OrderFly is more than just an ordering system. We provide a suite of intelligent tools designed to increase your revenue, streamline operations, and build customer loyalty.
                </p>
            </div>
            
            <div className="space-y-24">
                {features.map((feature, index) => (
                    <div key={feature.title} className="grid md:grid-cols-2 gap-12 items-center">
                        <div className={index % 2 === 1 ? 'md:order-last' : ''}>
                             <div className="relative w-full h-80 rounded-lg overflow-hidden shadow-xl">
                                <Image
                                    src={feature.imageUrl}
                                    alt={feature.title}
                                    fill
                                    className="object-cover"
                                    sizes="(max-width: 768px) 100vw, 50vw"
                                    data-ai-hint={feature.aiHint}
                                />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-3xl font-bold mb-4">{feature.title}</h2>
                            <p className="text-muted-foreground mb-6">{feature.description}</p>
                            <ul className="space-y-3">
                                {feature.details.map(detail => (
                                    <li key={detail} className="flex items-start">
                                        <div className="bg-primary/10 rounded-full p-1 mr-3 mt-1">
                                            <Check className="h-4 w-4 text-primary" />
                                        </div>
                                        <span className="flex-1 text-sm">{detail}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                ))}
            </div>

            <div className="text-center mt-24">
                <h2 className="text-3xl font-bold">Ready to take control?</h2>
                <p className="mt-4 text-muted-foreground">Let's build the future of your business together.</p>
                <Button asChild size="lg" className="mt-6">
                    <Link href="/contact?subject=Feature%20Inquiry">
                        Get Started
                    </Link>
                </Button>
            </div>
        </div>
      </main>
  );
}

export default function FeaturesClient() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <FeaturesClientInner />
        </Suspense>
    )
}
