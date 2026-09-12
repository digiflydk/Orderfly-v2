
'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { useSearchParams, usePathname } from 'next/navigation';
import type { AnalyticsAttribution, AnalyticsEventName, Brand } from '@/types';
import { commercePage } from '@/lib/commerce-metrics';
import { statisticsAllowed, trackingConsent, trackClientEvent } from '@/lib/analytics';
import { getBrandBySlug } from '@/app/superadmin/brands/actions';
import { campaignAttribution, normalizeAttribution, resolveAttribution } from '@/lib/analytics-attribution';

interface AnalyticsContextType {
  trackEvent: (eventName: AnalyticsEventName, props?: Record<string, any>) => boolean;
  sessionId: string | null;
  measurementKey: string;
  attribution: AnalyticsAttribution | null;
}

const AnalyticsContext = createContext<AnalyticsContextType | undefined>(undefined);

const SESSION_ID_COOKIE = 'orderfly_session_id';
const ATTRIBUTION_COOKIE = 'orderfly_attribution';
const SESSION_DAYS = 30 / (24 * 60);

interface AnalyticsProviderProps {
  children: ReactNode;
  brand?: Brand | null;
}

export function AnalyticsProvider({ children, brand: brandProp }: AnalyticsProviderProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [brand, setBrand] = useState<Brand | null>(brandProp || null);
  const [attribution, setAttribution] = useState<AnalyticsAttribution | null>(null);
  const [consentReady, setConsentReady] = useState(false);
  const [consent, setConsent] = useState({ statistics: false, marketing: false });
  const searchParams = useSearchParams();

  useEffect(() => {
    const update = () => { const next = trackingConsent(); setConsentReady(true); setConsent(previous => previous.statistics === next.statistics && previous.marketing === next.marketing ? previous : next); };
    update();
    window.addEventListener('orderfly:consent', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('orderfly:consent', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  const pathname = usePathname();

  useEffect(() => {
    if (!consentReady) return;
    try {
      const scope = brandProp?.id || brand?.id;
      const sessionCookie = `${SESSION_ID_COOKIE}_${scope || 'platform'}`;
      const attributionCookie = `${ATTRIBUTION_COOKIE}_${scope || 'platform'}`;
      // Retire the legacy year-long cross-brand identifier. Never repurpose it.
      Cookies.remove(SESSION_ID_COOKIE, { path: '/' });
      if (!consent.statistics) {
        Cookies.remove(sessionCookie, { path: '/' });
        Cookies.remove(attributionCookie, { path: '/' });
        setSessionId(null);
        setAttribution(null);
      } else if (scope) {
        const sid = Cookies.get(sessionCookie) || crypto.randomUUID();
        Cookies.set(sessionCookie, sid, { expires: SESSION_DAYS, path: '/', sameSite: 'Lax', secure: window.location.protocol === 'https:' });
        setSessionId(sid);
        let stored: AnalyticsAttribution | undefined;
        try { stored = normalizeAttribution(JSON.parse(Cookies.get(attributionCookie) || '{}')); } catch { /* Ignore corrupt attribution. */ }
        const currentTouch = campaignAttribution(searchParams, pathname, document.referrer);
        const resolved = resolveAttribution(currentTouch, stored);
        if (resolved && !consent.marketing) { delete resolved.gclid; delete resolved.gbraid; delete resolved.wbraid; delete resolved.fbclid; }
        setAttribution(resolved || null);
        if (resolved) Cookies.set(attributionCookie, JSON.stringify(resolved), { expires: SESSION_DAYS, path: '/', sameSite: 'Lax', secure: window.location.protocol === 'https:' });
      }

      if (!brandProp) {
        const parts = pathname.split('/').filter(Boolean);
        if (parts.length > 0) {
            const brandSlug = parts[0];
            getBrandBySlug(brandSlug).then(setBrand).catch(() => {});
        }
      }


    } catch { /* Analytics must not break the storefront when cookies are unavailable. */ }
  }, [searchParams, pathname, brandProp, brand?.id, consent, consentReady]);

  const trackEvent = useCallback((eventName: AnalyticsEventName, props: Record<string, any> = {}) => {
    try {
      const effectiveBrand = brandProp || brand;
      const currentConsent = trackingConsent();
      if (!effectiveBrand || (!currentConsent.statistics && !currentConsent.marketing) || currentConsent.statistics && !sessionId) return false;
      let activeSession: string | undefined;
      if (currentConsent.statistics) {
        const key = `${SESSION_ID_COOKIE}_${effectiveBrand.id}`;
        activeSession = Cookies.get(key) || crypto.randomUUID();
        Cookies.set(key, activeSession, { expires: SESSION_DAYS, path: '/', sameSite: 'Lax', secure: window.location.protocol === 'https:' });
        // Keep checkout attribution aligned with a session renewed after inactivity.
        if (activeSession !== sessionId) setSessionId(activeSession);
      }

      const eventData: Record<string, any> = {
        brandId: effectiveBrand.id,
        brandSlug: effectiveBrand.slug,
        brandGtmId: effectiveBrand.gtmContainerId, // For GTM logic
        sessionId: activeSession,
        currency: effectiveBrand.currency || 'DKK',
        deviceType: window.innerWidth < 768 ? 'mobile' : 'desktop',
        urlPath: window.location.pathname,
        ...(statisticsAllowed() && attribution ? attribution : {}),
        ...props, // Pass all props directly
      };

      return trackClientEvent(eventName, {...eventData, pageType: commercePage(window.location.pathname)});
    } catch { return false; /* Malformed attribution or telemetry failures must never block checkout. */ }
  }, [sessionId, brand, brandProp, attribution, consent]);

  return (
    <AnalyticsContext.Provider value={{ trackEvent, sessionId, attribution, measurementKey: consent.statistics ? sessionId || 'pending' : consent.marketing ? 'marketing' : 'denied' }}>
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
