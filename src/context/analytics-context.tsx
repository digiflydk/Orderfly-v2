
'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { useSearchParams, usePathname } from 'next/navigation';
import type { AnalyticsAttribution, AnalyticsEventName, Brand } from '@/types';
import { commercePage } from '@/lib/commerce-metrics';
import { statisticsAllowed, trackClientEvent } from '@/lib/analytics';
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { campaignAttribution, normalizeAttribution } from '@/lib/analytics-attribution';

interface AnalyticsContextType {
  trackEvent: (eventName: AnalyticsEventName, props?: Record<string, any>) => boolean;
  sessionId: string | null;
  attribution: AnalyticsAttribution | null;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

const SESSION_ID_COOKIE = 'orderfly_session_id';
const ATTRIBUTION_COOKIE = 'orderfly_attribution';
const ONE_YEAR_DAYS = 365;

interface AnalyticsProviderProps {
  children: ReactNode;
  brand?: Brand | null;
}

export function AnalyticsProvider({ children, brand: brandProp }: AnalyticsProviderProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [brand, setBrand] = useState<Brand | null>(brandProp || null);
  const [attribution, setAttribution] = useState<AnalyticsAttribution | null>(null);
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    try {
      // This code now runs only on the client, after hydration
      let sid = Cookies.get(SESSION_ID_COOKIE);
      if (!sid) {
        sid = crypto.randomUUID();
        Cookies.set(SESSION_ID_COOKIE, sid, { expires: ONE_YEAR_DAYS, path: '/', sameSite: 'Lax' });
      }
      setSessionId(sid);

      const currentTouch = campaignAttribution(searchParams, pathname, document.referrer);
      let stored: AnalyticsAttribution | undefined;
      try { stored = normalizeAttribution(JSON.parse(Cookies.get(ATTRIBUTION_COOKIE) || '{}')); } catch { /* Ignore corrupt attribution. */ }
      const resolved = currentTouch || stored;
      setAttribution(resolved || null);
      if (resolved && statisticsAllowed()) Cookies.set(ATTRIBUTION_COOKIE, JSON.stringify(resolved), { expires: 30, path: '/', sameSite: 'Lax' });

      const persistAfterConsent = () => {
        if (resolved && statisticsAllowed()) Cookies.set(ATTRIBUTION_COOKIE, JSON.stringify(resolved), { expires: 30, path: '/', sameSite: 'Lax' });
      };
      window.addEventListener('orderfly:consent', persistAfterConsent);

      if (!brandProp) {
        const parts = pathname.split('/').filter(Boolean);
        if (parts.length > 0) {
            const brandSlug = parts[0];
            getBrandBySlug(brandSlug).then(setBrand).catch(() => {});
        }
      }

      return () => window.removeEventListener('orderfly:consent', persistAfterConsent);
    } catch { /* Analytics must not break the storefront when cookies are unavailable. */ }
  }, [searchParams, pathname, brandProp]);

  const trackEvent = useCallback((eventName: AnalyticsEventName, props: Record<string, any> = {}) => {
    try {
      const effectiveBrand = brandProp || brand;
      if (!sessionId || !effectiveBrand) return false;

      const eventData: Record<string, any> = {
        brandId: effectiveBrand.id,
        brandSlug: effectiveBrand.slug,
        brandGtmId: effectiveBrand.gtmContainerId, // For GTM logic
        sessionId,
        deviceType: window.innerWidth < 768 ? 'mobile' : 'desktop',
        urlPath: window.location.pathname,
        ...(statisticsAllowed() && attribution ? attribution : {}),
        ...props, // Pass all props directly
      };

      return trackClientEvent(eventName, {...eventData, pageType: commercePage(window.location.pathname)});
    } catch { return false; /* Malformed attribution or telemetry failures must never block checkout. */ }
  }, [sessionId, brand, brandProp, attribution]);

  return (
    <AnalyticsContext.Provider value={{ trackEvent, sessionId, attribution }}>
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
