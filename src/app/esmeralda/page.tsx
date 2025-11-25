
'use client';

import { useEffect, useState } from 'react';
import { Template1Page, type Template1PageProps } from '@/components/public/brand-website/template-1/Template1Page';
import { Skeleton } from '@/components/ui/skeleton';
import type { WebsiteHeaderConfig } from '@/types/website';

function HeaderSkeleton() {
  return (
    <header className="h-20 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
      <Skeleton className="h-8 w-24" />
      <div className="hidden md:flex gap-4">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
      <Skeleton className="h-10 w-24 hidden md:block" />
      <Skeleton className="h-6 w-6 md:hidden" />
    </header>
  );
}

type HeaderData = Omit<Template1PageProps, 'children'>;

export default function EsmeraldaPage() {
  const [pageProps, setPageProps] = useState<HeaderData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      try {
        const res = await fetch(
          "/api/public/brand-website/template-1/header?brandSlug=esmeralda"
        );
        if (!res.ok) {
            console.error("Failed to fetch page data", res.status, res.statusText);
            if(isMounted) {
                setPageProps(null);
            }
            return;
        };
        const data = await res.json();
        if (isMounted) {
            const { designSystem, ...headerData } = data;
            
            // Construct the full header props object expected by Template1Page
            const finalProps: HeaderData = {
                header: headerData,
                designSystem: designSystem,
            };
            setPageProps(finalProps);
        }
      } catch (e) {
        console.error("Failed to load page data", e);
      } finally {
        if(isMounted) setIsLoading(false);
      }
    }

    loadData();
    return () => { isMounted = false; };
  }, []);
  
  if (isLoading || !pageProps) {
      return (
          <div className="bg-gray-900 text-white min-h-screen">
              <HeaderSkeleton />
              <main className="text-center py-20">
                  <h1 className="text-4xl font-bold">Esmeralda Pizza</h1>
                  <p className="text-lg mt-4 text-gray-300">Indhold kommer snart...</p>
              </main>
          </div>
      )
  }

  return (
    <Template1Page {...pageProps}>
      <section className="py-16 text-center">
       <h1 className="text-3xl font-bold">Esmeralda – Template 1 Preview</h1>
       <p className="mt-4 text-muted-foreground">
         Homepage sections (Hero, Menu, CTA, etc.) will be added in later tasks.
       </p>
     </section>
    </Template1Page>
  );
}
