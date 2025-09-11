'use client';

import * as React from 'react';
import Image from 'next/image';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import type { GeneralSettings } from '@/types/settings';
import { cn } from '@/lib/utils';

interface CustomersSectionProps {
  settings: GeneralSettings | null;
}

export default function CustomersSection({ settings }: CustomersSectionProps) {
  const customers = settings?.customers || [];
  
  const title = settings?.customersSectionTitle || "Betroet af branchens bedste";
  const description = settings?.customersSectionDescription || "";
  const alignment = settings?.customersSectionAlignment || 'center';

  const plugin = React.useRef(
    Autoplay({ delay: 2000, stopOnInteraction: true })
  );

  if (!customers || customers.length === 0) {
    return null;
  }
  
  const sectionPadding = settings?.sectionPadding?.customers;

  const style: React.CSSProperties & { [key: string]: string } = {
    '--padding-top-mobile': sectionPadding?.topMobile !== undefined ? `${sectionPadding.topMobile}px` : '48px',
    '--padding-bottom-mobile': sectionPadding?.bottomMobile !== undefined ? `${sectionPadding.bottomMobile}px` : '48px',
    '--padding-top': sectionPadding?.top !== undefined ? `${sectionPadding.top}px` : '96px',
    '--padding-bottom': sectionPadding?.bottom !== undefined ? `${sectionPadding.bottom}px` : '96px',
  };

  if (settings?.customersSectionBackgroundColor) {
    const { h, s, l } = settings.customersSectionBackgroundColor;
    style.backgroundColor = `hsl(${h}, ${s}%, ${l}%)`;
  }
  
  const titleStyle: React.CSSProperties = {
    fontSize: settings?.customersSectionTitleSize ? `${settings.customersSectionTitleSize}px` : undefined,
  };
  const descriptionStyle: React.CSSProperties = {
    fontSize: settings?.customersSectionDescriptionSize ? `${settings.customersSectionDescriptionSize}px` : undefined,
  };
  
  const alignmentClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };


  return (
    <section 
        id="customers" 
        style={style}
        className={cn('py-[var(--padding-top-mobile)] md:py-[var(--padding-top)] pb-[var(--padding-bottom-mobile)] md:pb-[var(--padding-bottom)]', !settings?.customersSectionBackgroundColor && 'bg-secondary')}
    >
      <div className="container mx-auto max-w-7xl px-4 md:px-6">
        <div className={cn("mb-12", alignmentClasses[alignment])}>
            <h3 
                className={cn("text-lg font-semibold tracking-wider uppercase", settings?.customersSectionTitleColor || 'text-muted-foreground', {
                    'mx-auto': alignment === 'center',
                    'ml-auto': alignment === 'right',
                })}
                style={titleStyle}
            >
                {title}
            </h3>
            {description && (
                <p 
                    className={cn("mt-4 max-w-2xl text-body", settings?.customersSectionDescriptionColor || "text-muted-foreground", {
                        'mx-auto': alignment === 'center',
                        'ml-auto': alignment === 'right',
                    })}
                    style={descriptionStyle}
                >
                    {description}
                </p>
            )}
        </div>
        <Carousel
          plugins={[plugin.current]}
          className="w-full"
          onMouseEnter={plugin.current.stop}
          onMouseLeave={plugin.current.reset}
          opts={{
            align: "start",
            loop: true,
          }}
        >
          <CarouselContent className="-ml-12">
            {customers.map((customer) => (
              <CarouselItem key={customer.id} className="pl-12 basis-1/2 md:basis-1/3 lg:basis-1/5">
                <div className="relative h-16 w-full flex items-center justify-center">
                   <Image
                      src={customer.logoUrl}
                      alt={customer.name}
                      fill
                      className="object-contain"
                      sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                      data-ai-hint={customer.aiHint}
                    />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      </div>
    </section>
  );
}
