'use client';

import { useEffect, useState } from 'react';
import { Header, type Template1HeaderProps } from '@/components/public/brand-website/template-1/Header';
import { Skeleton } from '@/components/ui/skeleton';

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

export default function EsmeraldaPage() {
  const [headerProps, setHeaderProps] = useState<Template1HeaderProps | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadHeader() {
      setIsLoading(true);
      try {
        const res = await fetch(
          "/api/public/brand-website/template-1/header?brandSlug=esmeralda"
        );
        if (!res.ok) {
            console.error("Failed to fetch header props", res.status, res.statusText);
            if(isMounted) setHeaderProps(null);
            return;
        };
        const data = await res.json();
        if (isMounted) setHeaderProps(data);
      } catch (e) {
        console.error("Failed to load header props", e);
      } finally {
        if(isMounted) setIsLoading(false);
      }
    }

    loadHeader();
    return () => { isMounted = false; };
  }, []);

  return (
    <div className="bg-gray-900 text-white min-h-screen">
      {isLoading ? <HeaderSkeleton /> : (headerProps ? <Header {...headerProps} /> : <HeaderSkeleton />)}
      <main className="text-center py-20">
        <h1 className="text-4xl font-bold">Esmeralda Pizza</h1>
        <p className="text-lg mt-4 text-gray-300">Indhold kommer snart...</p>
      </main>
    </div>
  );
}
