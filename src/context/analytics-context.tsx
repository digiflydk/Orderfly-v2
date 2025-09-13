
'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { useSearchParams, usePathname } from 'next/navigation';
import type { AnalyticsEventName, Brand } from '@/types';
import { trackClientEvent } from '@/lib/analytics';
import { getBrandBySlug } from '@/app/superadmin/brands/actions';

interface AnalyticsContextType {
  trackEvent: (eventName: AnalyticsEventName, props?: Record<string, any>) => void;
  sessionId: string | null;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

const SESSION_ID_COOKIE = 'orderfly_session_id';
const ATTRIBUTION_COOKIE = 'orderfly_attribution';
const ONE_YEAR_DAYS = 365;

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    // This code now runs only on the client, after hydration
    let sid = Cookies.get(SESSION_ID_COOKIE);
    if (!sid) {
      sid = crypto.randomUUID();
      Cookies.set(SESSION_ID_COOKIE, sid, { expires: ONE_YEAR_DAYS, path: '/', sameSite: 'Lax' });
    }
    setSessionId(sid);

    if (!Cookies.get(ATTRIBUTION_COOKIE)) {
      const attributionData = {
        utm_source: searchParams.get('utm_source'),
        utm_medium: searchParams.get('utm_medium'),
        utm_campaign: searchParams.get('utm_campaign'),
        utm_term: searchParams.get('utm_term'),
        utm_content: searchParams.get('utm_content'),
        referrer: document.referrer,
        landingPage: pathname,
      };
      const filteredData = Object.fromEntries(Object.entries(attributionData).filter(([_, v]) => v != null));
      if (Object.keys(filteredData).length > 0) {
        Cookies.set(ATTRIBUTION_COOKIE, JSON.stringify(filteredData), { expires: 30, path: '/', sameSite: 'Lax' });
      }
    }
    
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
        const brandSlug = parts[0];
        getBrandBySlug(brandSlug).then(setBrand);
    }

  }, [searchParams, pathname]);
  
  const trackEvent = useCallback((eventName: AnalyticsEventName, props: Record<string, any> = {}) => {
    if (!sessionId || !brand) return;

    const attributionCookie = Cookies.get(ATTRIBUTION_COOKIE);
    const attributionData = attributionCookie ? JSON.parse(attributionCookie) : {};
    
    const eventData: Record<string, any> = {
      brandId: brand.id,
      brandSlug: brand.slug,
      brandGtmId: brand.gtmContainerId, // For GTM logic
      sessionId,
      deviceType: window.innerWidth < 768 ? 'mobile' : 'desktop',
      urlPath: window.location.pathname,
      ...attributionData,
      ...props, // Pass all props directly
    };
    
    trackClientEvent(eventName, eventData);

  }, [sessionId, brand]);

  return (
    <AnalyticsContext.Provider value={{ trackEvent, sessionId }}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const context = useContext(AnalyticsContext);
  if (context === undefined) {
    throw new Error('useAnalytics must be used within an AnalyticsProvider');
  }
  return context;
}
