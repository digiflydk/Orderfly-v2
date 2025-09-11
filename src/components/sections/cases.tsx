
'use client';
import Image from 'next/image';
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import Link from 'next/link';
import type { Case, GeneralSettings } from '@/types/settings';
import { cn } from '@/lib/utils';


const defaultCases: Case[] = [
  {
    title: 'Automatiseret Fakturering',
    description: 'Udvikling af et system der sparede en mellemstor virksomhed for 20+ timer i manuelt tastearbejde om ugen.',
    imageUrl: 'https://picsum.photos/600/400?random=5',
    link: '#',
    aiHint: 'invoice automation',
  },
  {
    title: 'Dynamisk Prissætnings-AI',
    description: 'En AI-model for en webshop der optimerede priser i realtid og øgede overskuddet med 12%.',
    imageUrl: 'https://picsum.photos/600/400?random=6',
    link: '#',
    aiHint: 'pricing algorithm',
  },
  {
    title: 'Skalerbar Cloud Platform',
    description: 'Migration til en moderne cloud-arkitektur, der håndterede en 10x stigning i trafik uden problemer.',
    imageUrl: 'https://picsum.photos/600/400?random=7',
    link: '#',
    aiHint: 'cloud platform',
  },
];

interface CasesSectionProps {
    settings: GeneralSettings | null
}

export default function CasesSection({ settings }: CasesSectionProps) {
  const cases = settings?.cases && settings.cases.length > 0 ? settings.cases : defaultCases;
  const title = settings?.casesSectionTitle || "Vores Arbejde";
  const description = settings?.casesSectionDescription || "Se eksempler på, hvordan vi har hjulpet andre virksomheder med at opnå deres mål.";
  const alignment = settings?.casesSectionAlignment || 'center';

  const titleStyle: React.CSSProperties = {
    fontSize: settings?.casesSectionTitleSize ? `${settings.casesSectionTitleSize}px` : undefined,
  };
  const descriptionStyle: React.CSSProperties = {
    fontSize: settings?.casesSectionDescriptionSize ? `${settings.casesSectionDescriptionSize}px` : undefined,
  };
  
  const sectionPadding = settings?.sectionPadding?.cases;
  const style: React.CSSProperties & { [key: string]: string } = {
    '--padding-top-mobile': sectionPadding?.topMobile !== undefined ? `${sectionPadding.topMobile}px` : '48px',
    '--padding-bottom-mobile': sectionPadding?.bottomMobile !== undefined ? `${sectionPadding.bottomMobile}px` : '48px',
    '--padding-top': sectionPadding?.top !== undefined ? `${sectionPadding.top}px` : '96px',
    '--padding-bottom': sectionPadding?.bottom !== undefined ? `${sectionPadding.bottom}px` : '96px',
  };
  
  const alignmentClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <section 
        id="cases" 
        className="bg-background py-[var(--padding-top-mobile)] md:py-[var(--padding-top)] pb-[var(--padding-bottom-mobile)] md:pb-[var(--padding-bottom)]" 
        style={style}
    >
      <div className="container mx-auto max-w-7xl px-4 md:px-6">
        <div className={cn("mb-12", alignmentClasses[alignment])}>
           <h2 
            className={cn("text-h2 font-bold tracking-tight", settings?.casesSectionTitleColor || "text-black")}
            style={titleStyle}
          >
            {title}
          </h2>
          <p 
            className={cn("mt-4 max-w-2xl text-body", settings?.casesSectionDescriptionColor || "text-muted-foreground", {
                'mx-auto': alignment === 'center',
                'ml-auto': alignment === 'right',
            })}
            style={descriptionStyle}
          >
            {description}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {cases.map((caseStudy) => (
            <Card key={caseStudy.title} className="flex flex-col overflow-hidden transition-all hover:shadow-xl hover:-translate-y-1">
                <div className="relative w-full h-48">
                  <Image
                    src={caseStudy.imageUrl}
                    alt={caseStudy.title}
                    data-ai-hint={caseStudy.aiHint}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover"
                  />
                </div>
              <CardHeader className="flex-grow">
                <CardTitle className="mb-2 text-h4">{caseStudy.title}</CardTitle>
                <CardDescription>{caseStudy.description}</CardDescription>
              </CardHeader>
              <CardFooter>
                 <Link href={caseStudy.link} className={cn(buttonVariants({ variant: 'link' }), 'pl-0')}>
                    Læs mere
                </Link>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
