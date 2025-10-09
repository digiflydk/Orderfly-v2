

'use client';
import Image from 'next/image';
import { type GeneralSettings } from '@/types/settings';
import { cn } from '@/lib/utils';
import { CSSProperties, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight } from 'lucide-react';


function FeatureSectionInner({ settings }: { settings: GeneralSettings | null }) {
    const pathname = usePathname();
    
    const heading = settings?.featureSectionHeading || 'Fremhævet Overskrift';
    const body = settings?.featureSectionBody || 'Dette er en beskrivelse af den fremhævede funktion. Du kan redigere denne tekst i CMS\'et. Det er et godt sted at uddybe fordelene ved dit produkt eller din service.';
    const imageUrl = settings?.featureSectionImageUrl || 'https://picsum.photos/800/600';
    const aiHint = settings?.featureSectionAiHint || 'featured content';
    const ctaText = settings?.featureSectionCtaText || 'Lær Mere';
    const ctaLink = settings?.featureSectionCtaLink || '#';
    const ctaVariant = settings?.featureSectionCtaVariant || 'default';
    const ctaSize = settings?.featureSectionCtaSize || 'lg';

    const sectionPadding = settings?.sectionPadding?.feature;

    const sectionStyle: CSSProperties & { [key: string]: string } = {
        '--padding-top-mobile': sectionPadding?.topMobile !== undefined ? `${sectionPadding.topMobile}px` : '48px',
        '--padding-bottom-mobile': sectionPadding?.bottomMobile !== undefined ? `${sectionPadding.bottomMobile}px` : '48px',
        '--padding-top': sectionPadding?.top !== undefined ? `${sectionPadding.top}px` : '96px',
        '--padding-bottom': sectionPadding?.bottom !== undefined ? `${sectionPadding.bottom}px` : '96px',
    };
    if (settings?.featureSectionBackgroundColor) {
        const { h, s, l } = settings.featureSectionBackgroundColor;
        sectionStyle.backgroundColor = `hsl(${h}, ${s}%, ${l}%)`;
    }

    const headingStyle: CSSProperties = {
        fontSize: settings?.featureSectionHeadingSizeMobile ? `${settings.featureSectionHeadingSizeMobile}px` : undefined,
    };
     const headingStyleDesktop: CSSProperties = {
        fontSize: settings?.featureSectionHeadingSize ? `${settings.featureSectionHeadingSize}px` : undefined,
    };
    const bodyStyle: CSSProperties = {
         fontSize: settings?.featureSectionBodySizeMobile ? `${settings.featureSectionBodySizeMobile}px` : undefined,
    };
    const bodyStyleDesktop: CSSProperties = {
        fontSize: settings?.featureSectionBodySize ? `${settings.featureSectionBodySize}px` : undefined,
    };
    const ctaStyle: CSSProperties = {
        fontSize: settings?.featureSectionCtaTextSizeMobile ? `${settings.featureSectionCtaTextSizeMobile}px` : undefined,
    };
    const ctaStyleDesktop: CSSProperties = {
        fontSize: settings?.featureSectionCtaTextSize ? `${settings.featureSectionCtaTextSize}px` : undefined,
    };

    const getLinkHref = (href: string) => {
        if (href.startsWith('#') && pathname !== '/') {
            return `/${href}`;
        }
        return href;
    };

    const alignment = settings?.featureSectionAlignment || 'left';
    const alignmentClasses = {
        left: 'text-left items-start',
        center: 'text-center items-center',
        right: 'text-right items-end',
    };
    
    const textContent = (
        <div className={cn('flex flex-col space-y-6', alignmentClasses[alignment])}>
            <h2
                className={cn("text-h2 font-bold tracking-tight md:hidden", settings?.featureSectionHeadingColor)}
                style={headingStyle}
            >
                {heading}
            </h2>
            <h2
                className={cn("text-h2 font-bold tracking-tight hidden md:block", settings?.featureSectionHeadingColor)}
                style={headingStyleDesktop}
            >
                {heading}
            </h2>
            <p
                className={cn("text-body md:hidden", settings?.featureSectionBodyColor || 'text-muted-foreground')}
                style={bodyStyle}
            >
                {body}
            </p>
             <p
                className={cn("text-body hidden md:block", settings?.featureSectionBodyColor || 'text-muted-foreground')}
                style={bodyStyleDesktop}
            >
                {body}
            </p>
            {ctaText && ctaLink && (
                <div className="pt-4">
                    <Button
                        asChild
                        size={ctaSize}
                        variant={ctaVariant}
                        className="md:hidden"
                        style={ctaStyle}
                    >
                        <Link href={getLinkHref(ctaLink)}>
                            {ctaText}
                            {ctaVariant === 'pill' && <ArrowRight className="ml-2 h-4 w-4" />}
                        </Link>
                    </Button>
                     <Button
                        asChild
                        size={ctaSize}
                        variant={ctaVariant}
                        className="hidden md:inline-flex"
                        style={ctaStyleDesktop}
                    >
                        <Link href={getLinkHref(ctaLink)}>
                            {ctaText}
                            {ctaVariant === 'pill' && <ArrowRight className="ml-2 h-4 w-4" />}
                        </Link>
                    </Button>
                </div>
            )}
        </div>
    );
    
    const imageContent = (
         <div className="relative w-full h-80 md:h-96 rounded-lg overflow-hidden shadow-xl">
            <Image
                src={imageUrl}
                alt={heading}
                data-ai-hint={aiHint}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
            />
        </div>
    );

    return (
        <section id="feature" className="py-[var(--padding-top-mobile)] md:py-[var(--padding-top)] pb-[var(--padding-bottom-mobile)] md:pb-[var(--padding-bottom)]" style={sectionStyle}>
            <div className="container mx-auto max-w-7xl px-4 md:px-6">
                <div className="grid md:grid-cols-2 gap-12 items-center">
                    {alignment === 'right' ? (
                        <>
                            {imageContent}
                            {textContent}
                        </>
                    ) : (
                        <>
                            {textContent}
                            {imageContent}
                        </>
                    )}
                </div>
            </div>
        </section>
    );
}

export default function FeatureSection({ settings }: { settings: GeneralSettings | null }) {
    return (
        <Suspense fallback={<section id="feature" className="py-24"></section>}>
            <FeatureSectionInner settings={settings} />
        </Suspense>
    )
}
