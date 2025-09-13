
'use client';
import Image from 'next/image';
import type { GeneralSettings } from '@/types/settings';
import { cn } from '@/lib/utils';
import { CSSProperties, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

function HeroSectionInner({ settings }: { settings: GeneralSettings | null }) {
  const pathname = usePathname();
  const headline = settings?.heroHeadline || 'Flow. Automatisér. Skalér.';
  const description = settings?.heroDescription || 'Vi hjælper virksomheder med at bygge skalerbare digitale løsninger, der optimerer processer og driver vækst.';
  
  const heroImageGrid = settings?.heroImageGrid || [
    { imageUrl: 'https://picsum.photos/600/400?random=1', alt: 'Showcase 1' },
    { imageUrl: 'https://picsum.photos/600/400?random=2', alt: 'Showcase 2' },
    { imageUrl: 'https://picsum.photos/600/400?random=3', alt: 'Showcase 3' },
    { imageUrl: 'https://picsum.photos/600/400?random=4', alt: 'Showcase 4' },
  ];
  
  const headlineDesktopSize = settings?.heroHeadlineSize ?? 64;
  const headlineMobileSize = settings?.heroHeadlineSizeMobile ?? 40;
  const descriptionDesktopSize = settings?.heroDescriptionSize ?? 18;
  const descriptionMobileSize = settings?.heroDescriptionSizeMobile ?? 16;
  const textMaxWidth = settings?.heroTextMaxWidth ?? 700;

  const headerHeight = settings?.headerHeight || 64;

  const heroStyles = {
    '--headline-desktop-size': `${headlineDesktopSize}px`,
    '--headline-mobile-size': `${headlineMobileSize}px`,
    '--description-desktop-size': `${descriptionDesktopSize}px`,
    '--description-mobile-size': `${descriptionMobileSize}px`,
    '--text-max-width': `${textMaxWidth}px`,
  } as CSSProperties;
  
  const headlineStyle: CSSProperties = {
    fontSize: 'var(--headline-mobile-size)',
  };
  const headlineStyleDesktop: CSSProperties = {
      fontSize: 'var(--headline-desktop-size)',
  };
  const descriptionStyle: CSSProperties = {
      fontSize: 'var(--description-mobile-size)',
  };
  const descriptionStyleDesktop: CSSProperties = {
      fontSize: 'var(--description-desktop-size)',
  };

  const ctaStyle: React.CSSProperties = settings?.heroCtaTextSizeMobile ? { fontSize: `${settings.heroCtaTextSizeMobile}px` } : {};
  const ctaStyleDesktop: React.CSSProperties = settings?.heroCtaTextSize ? { fontSize: `${settings.heroCtaTextSize}px` } : {};

  const getLinkHref = (href: string) => {
    if (href.startsWith('#') && pathname !== '/') {
        return `/${href}`;
    }
    return href;
  };
  
  const verticalAlignmentClasses = {
      top: 'justify-start pt-32',
      center: 'justify-center',
      bottom: 'justify-end pb-20'
  }
  
  const horizontalAlignmentClasses = {
        left: 'items-start text-left',
        center: 'items-center text-center',
        right: 'items-end text-right'
  }

  const enableGradient = settings?.heroEnableGradientOverlay !== false;

  return (
    <section
      id="hero"
      className="relative w-full bg-muted"
      style={heroStyles}
    >
        <style jsx>{`
            .hero-headline {
                font-size: var(--headline-mobile-size);
            }
            .hero-description {
                font-size: var(--description-mobile-size);
            }
            .hero-text-container {
                max-width: var(--text-max-width);
            }
            @media (min-width: 768px) {
                .hero-headline {
                    font-size: var(--headline-desktop-size);
                }
                .hero-description {
                    font-size: var(--description-desktop-size);
                }
            }
        `}</style>
      <div className="container mx-auto max-w-7xl px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center min-h-[60vh] py-24">
            <div className={cn(
                "flex flex-col space-y-6 hero-text-container z-10 w-full",
                horizontalAlignmentClasses[settings?.heroAlignment || 'center']
            )}>
              <h1 
                className={cn("hero-headline font-bold tracking-tight font-headline", settings?.heroHeadlineColor)}
                style={headlineStyleDesktop}
              >
                {headline}
              </h1>
              <p 
                className={cn("hero-description text-body", settings?.heroDescriptionColor || 'text-muted-foreground')}
                style={descriptionStyleDesktop}
              >
                {description}
              </p>
              {settings?.heroCtaEnabled && settings?.heroCtaText && settings?.heroCtaLink && (
                 <div className="pt-4">
                    <Button
                      asChild
                      size={settings.heroCtaSize || 'lg'}
                      variant={settings.heroCtaVariant || 'default'}
                      className="md:hidden"
                      style={ctaStyle}
                    >
                      <Link href={getLinkHref(settings.heroCtaLink)}>
                        {settings.heroCtaText}
                        {settings.heroCtaVariant === 'pill' && <ArrowRight className="ml-2 h-4 w-4" />}
                      </Link>
                    </Button>
                     <Button
                      asChild
                      size={settings.heroCtaSize || 'lg'}
                      variant={settings.heroCtaVariant || 'default'}
                      className="hidden md:inline-flex"
                      style={ctaStyleDesktop}
                    >
                      <Link href={getLinkHref(settings.heroCtaLink)}>
                        {settings.heroCtaText}
                        {settings.heroCtaVariant === 'pill' && <ArrowRight className="ml-2 h-4 w-4" />}
                      </Link>
                    </Button>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
                {heroImageGrid.map((image, index) => (
                    <div key={index} className="relative aspect-[4/3] rounded-lg overflow-hidden">
                        <Image src={image.imageUrl} alt={image.alt} fill className="object-cover" sizes="(max-width: 768px) 50vw, 25vw"/>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </section>
  );
}

export default function HeroSection({ settings }: { settings: GeneralSettings | null }) {
    return (
        <Suspense fallback={<section id="hero" className="relative w-full h-[75vh] min-h-[500px] max-h-[800px] bg-gray-800"></section>}>
            <HeroSectionInner settings={settings} />
        </Suspense>
    )
}
