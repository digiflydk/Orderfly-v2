
'use client';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Service, GeneralSettings } from '@/types/settings';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const defaultServices: Service[] = [
  {
    title: 'Digital Strategi',
    description: 'Vi lægger en køreplan for jeres digitale transformation med fokus på ROI og forretningsmål.',
    imageUrl: 'https://picsum.photos/600/400?random=1',
    aiHint: 'strategy business',
  },
  {
    title: 'Softwareudvikling',
    description: 'Skræddersyede softwareløsninger, fra web-apps til komplekse systemintegrationer.',
    imageUrl: 'https://picsum.photos/600/400?random=2',
    aiHint: 'software development',
  },
  {
    title: 'AI & Automatisering',
    description: 'Implementering af kunstig intelligens og automatisering for at optimere jeres workflows.',
    imageUrl: 'https://picsum.photos/600/400?random=3',
    aiHint: 'artificial intelligence',
  },
  {
    title: 'Cloud Løsninger',
    description: 'Sikker og skalerbar cloud-infrastruktur, der understøtter jeres vækstambitioner.',
    imageUrl: 'https://picsum.photos/600/400?random=4',
    aiHint: 'cloud infrastructure',
  },
];

interface ServicesSectionProps {
  settings: GeneralSettings | null;
}

export default function ServicesSection({ settings }: ServicesSectionProps) {
  const services = settings?.services && settings.services.length > 0 ? settings.services : defaultServices;
  const title = settings?.servicesSectionTitle || "Vores Services";
  const description = settings?.servicesSectionDescription || "Vi tilbyder en bred vifte af ydelser for at accelerere jeres digitale rejse.";
  const alignment = settings?.servicesSectionAlignment || 'center';

  const titleStyle: React.CSSProperties = {
    fontSize: settings?.servicesSectionTitleSize ? `${settings.servicesSectionTitleSize}px` : undefined,
  };
  const descriptionStyle: React.CSSProperties = {
    fontSize: settings?.servicesSectionDescriptionSize ? `${settings.servicesSectionDescriptionSize}px` : undefined,
  };

  const serviceCardTitleStyle: React.CSSProperties = {
      fontSize: settings?.serviceCardTitleSize ? `${settings.serviceCardTitleSize}px` : undefined,
  }
  const serviceCardDescriptionStyle: React.CSSProperties = {
      fontSize: settings?.serviceCardDescriptionSize ? `${settings.serviceCardDescriptionSize}px` : undefined,
  }
  
  const ctaStyle: React.CSSProperties = settings?.servicesCtaTextSizeMobile ? { fontSize: `${settings.servicesCtaTextSizeMobile}px` } : {};
  const ctaStyleDesktop: React.CSSProperties = settings?.servicesCtaTextSize ? { fontSize: `${settings.servicesCtaTextSize}px` } : {};


  const sectionPadding = settings?.sectionPadding?.services;

  const style: React.CSSProperties & { [key: string]: string } = {
    '--padding-top-mobile': sectionPadding?.topMobile !== undefined ? `${sectionPadding.topMobile}px` : '48px',
    '--padding-bottom-mobile': sectionPadding?.bottomMobile !== undefined ? `${sectionPadding.bottomMobile}px` : '48px',
    '--padding-top': sectionPadding?.top !== undefined ? `${sectionPadding.top}px` : '96px',
    '--padding-bottom': sectionPadding?.bottom !== undefined ? `${sectionPadding.bottom}px` : '96px',
  };

  if (settings?.servicesSectionBackgroundColor) {
    const { h, s, l } = settings.servicesSectionBackgroundColor;
    style.backgroundColor = `hsl(${h}, ${s}%, ${l}%)`;
  }
  
  const alignmentClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };


  return (
    <section 
        id="services" 
        style={style}
        className={cn('py-[var(--padding-top-mobile)] md:py-[var(--padding-top)] pb-[var(--padding-bottom-mobile)] md:pb-[var(--padding-bottom)]', !settings?.servicesSectionBackgroundColor && 'bg-secondary')}
    >
      <div className="container mx-auto max-w-7xl px-4 md:px-6">
        <div className={cn("mb-12", alignmentClasses[alignment])}>
          <h2 
            className={cn("text-h2 font-bold tracking-tight", settings?.servicesSectionTitleColor || "text-black")}
            style={titleStyle}
          >
            {title}
          </h2>
          <p 
            className={cn("mt-4 max-w-2xl text-body", settings?.servicesSectionDescriptionColor || "text-muted-foreground", {
                'mx-auto': alignment === 'center',
                'ml-auto': alignment === 'right',
            })}
            style={descriptionStyle}
          >
            {description}
          </p>
        </div>
        <div className="flex flex-wrap gap-8 justify-center">
          {services.map((service) => (
            <Card key={service.title} className="group flex flex-col overflow-hidden transition-all hover:shadow-lg hover:-translate-y-1 w-full sm:w-[calc(50%-1rem)] lg:w-[calc(33.333%-1.5rem)]">
              <div className="relative w-full h-48">
                  <Image
                    src={service.imageUrl}
                    alt={service.title}
                    data-ai-hint={service.aiHint}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
              <CardHeader>
                <CardTitle 
                    className={cn(settings?.serviceCardTitleColor)}
                    style={serviceCardTitleStyle}
                >
                    {service.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-grow">
                <p 
                    className={cn(settings?.serviceCardDescriptionColor)}
                    style={serviceCardDescriptionStyle}
                >
                    {service.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
        {settings?.servicesCtaEnabled && (
            <div className="mt-12 text-center">
                <Button
                    asChild
                    size={settings.servicesCtaSize || 'lg'}
                    variant={settings.servicesCtaVariant || 'default'}
                    className="md:hidden"
                    style={ctaStyle}
                >
                    <Link href={settings.servicesCtaLink || '#kontakt'}>
                        {settings.servicesCtaText || 'Book et møde med os'}
                        {settings.servicesCtaVariant === 'pill' && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Link>
                </Button>
                <Button
                    asChild
                    size={settings.servicesCtaSize || 'lg'}
                    variant={settings.servicesCtaVariant || 'default'}
                    className="hidden md:inline-flex"
                    style={ctaStyleDesktop}
                >
                    <Link href={settings.servicesCtaLink || '#kontakt'}>
                        {settings.servicesCtaText || 'Book et møde med os'}
                        {settings.servicesCtaVariant === 'pill' && <ArrowRight className="ml-2 h-4 w-4" />}
                    </Link>
                </Button>
            </div>
        )}
      </div>
    </section>
  );
}
