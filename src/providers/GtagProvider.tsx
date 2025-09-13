'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { pageView } from '@/lib/analytics/gtag';

export default function GtagProvider() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    // page_view ved første render + på route changes
    pageView(`${pathname}${search?.toString() ? `?${search}` : ''}`);
  }, [pathname, search]);

  return null;
}
