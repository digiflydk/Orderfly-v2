
'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import type { PublicCookieTexts } from '@/lib/cookie-texts';
import { shouldShowCookieBanner } from '@/lib/cookie-banner-state';
const CookiePreferencesDialog = dynamic(() => import('./cookie-preferences-dialog'), { ssr: false });
import Cookies from 'js-cookie';
import { optionalGet, optionalSet } from '@/lib/optional-storage';
import { Button } from './ui/button';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { useCookieTexts } from '@/hooks/use-cookie-texts';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { AnonymousCookieConsent } from '@/types';
import { saveConsentChoice, retryPendingConsent } from '@/lib/consent-sync';

interface CookieConsentProps {
  brandId: string;
  compact?: boolean;
  initialTexts?: PublicCookieTexts;
  initialShowBanner?: boolean;
  isModalOpen: boolean;
  setIsModalOpen: (isOpen: boolean) => void;
}

const CONSENT_COOKIE_NAME = 'orderfly_cookie_consent';
const ANONYMOUS_ID_COOKIE_NAME = 'orderfly_anonymous_id';
const ONE_YEAR_DAYS = 365;

function getOrCreateAnonId() {
  const COOKIE_DOMAIN = window.location.hostname.includes('orderfly.app') ? '.orderfly.app' : undefined;
  let id = optionalGet('orderfly_anonymous_id');
  try { id ||= Cookies.get(ANONYMOUS_ID_COOKIE_NAME) || null; } catch { /* Cookies unavailable. */ }
  if (!id) {
    id = crypto.randomUUID();
  }
  optionalSet('orderfly_anonymous_id', id);
  try { Cookies.set(ANONYMOUS_ID_COOKIE_NAME, id, {
    expires: ONE_YEAR_DAYS,
    path: '/',
    ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
    sameSite: 'Lax'
  }); } catch { /* Keep the in-memory identity. */ }
  return id;
}

export function CookieConsent({ brandId, isModalOpen, setIsModalOpen, compact = false, initialTexts, initialShowBanner = false }: CookieConsentProps) {
  const [showBanner, setShowBanner] = useState(initialShowBanner);
  const { texts, loading } = useCookieTexts({ brandId, initialTexts });
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined' && texts.consent_version) {
        let existingConsentCookie = optionalGet(CONSENT_COOKIE_NAME);
        try { existingConsentCookie ||= Cookies.get(CONSENT_COOKIE_NAME) || null; } catch { /* No consent inferred. */ }
        setShowBanner(shouldShowCookieBanner(existingConsentCookie, texts.consent_version));
    }
  }, [texts.consent_version]);

  useEffect(() => { void retryPendingConsent(); }, []);

  const categories = texts?.categories ?? {};
  const compatCategories = {
    necessary: categories.necessary,
    functional: categories.functional,
    statistics: categories.statistics ?? categories.analytics,
    marketing: categories.marketing,
    performance: categories.performance
  };


  const [preferences, setPreferences] = useState({
    necessary: true,
    functional: false,
    statistics: false,
    marketing: false,
  });

  useEffect(() => {
    if (!isModalOpen) return;
    try {
      const saved = JSON.parse(optionalGet(CONSENT_COOKIE_NAME) || Cookies.get(CONSENT_COOKIE_NAME) || '{}');
      setPreferences({ necessary: true, functional: saved.functional === true, statistics: saved.statistics === true || saved.analytics === true, marketing: saved.marketing === true });
    } catch { /* Keep conservative defaults. */ }
  }, [isModalOpen]);

   useEffect(() => {
    if (pathname.includes('/superadmin') || pathname.includes('/admin')) {
      setShowBanner(false);
    }
  }, [pathname]);

  const saveConsent = (consentData: any) => {
    setShowBanner(false);
    setIsModalOpen(false);
    const COOKIE_DOMAIN = window.location.hostname.includes('orderfly.app') ? '.orderfly.app' : undefined;

    optionalSet(CONSENT_COOKIE_NAME, JSON.stringify(consentData));
    try { Cookies.set(CONSENT_COOKIE_NAME, JSON.stringify(consentData), {
        expires: ONE_YEAR_DAYS,
        path: '/',
        ...(COOKIE_DOMAIN ? { domain: COOKIE_DOMAIN } : {}),
        sameSite: 'Lax'
    });

    } catch { /* The user's explicit choice remains in memory. */ }
    window.dispatchEvent(new CustomEvent('orderfly:consent', { detail: consentData }));
    const anonymousId = getOrCreateAnonId();

    const dataToSend: Omit<AnonymousCookieConsent, 'id' | 'first_seen' | 'last_seen' | 'linked_to_customer'> = {
        anon_user_id: anonymousId,
        marketing: consentData.marketing,
        statistics: consentData.statistics,
        functional: consentData.functional,
        necessary: true,
        consent_version: texts.consent_version,
        origin_brand: brandId,
        brand_id: brandId,
        shared_scope: 'orderfly',
    };

    void saveConsentChoice(dataToSend);
  };

  const handleAcceptAll = () => {
    const consent = { ...preferences, functional: true, statistics: true, marketing: true, necessary: true, consent_version: texts.consent_version };
    saveConsent(consent);
  };

  const handleSavePreferences = () => {
    const consent = { ...preferences, consent_version: texts.consent_version };
    saveConsent(consent);
  };


  const handleCustomize = () => {
    setShowBanner(false);
    setIsModalOpen(true);
  };

  if (loading || (!showBanner && !isModalOpen) || !compatCategories.necessary || !compatCategories.statistics) {
    return null;
  }

  return <>
    {showBanner && (compact ? <section data-cookie-banner="compact" role="region" aria-label={texts.banner_title}
        className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-3 shadow-xl max-h-[30dvh] overflow-y-auto">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-sm font-semibold leading-5">{texts.banner_title}</h2>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">{texts.banner_description}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:flex">
            <Button className="min-h-11 h-auto px-2 text-xs sm:text-sm" variant="outline" onClick={() => saveConsent({ necessary: true, functional: false, statistics: false, marketing: false, consent_version: texts.consent_version })}>{texts.language.toLowerCase().split('-')[0] === 'da' ? 'Afvis valgfrie' : 'Reject optional'}</Button>
            <Button className="min-h-11 h-auto px-2 text-xs sm:text-sm" onClick={handleAcceptAll}>{texts.accept_all_button}</Button>
            <Button className="col-span-2 min-h-11 h-auto px-2 text-xs sm:text-sm" variant="outline" onClick={handleCustomize}>{texts.customize_button}</Button>
          </div>
        </div>
      </section> : <div className={cn("fixed bottom-0 left-0 right-0 z-50 p-4 transform-gpu transition-transform duration-300", showBanner ? "translate-y-0" : "translate-y-full")}>
         <Card className="w-full max-w-4xl mx-auto shadow-xl">
          <CardHeader>
            <CardTitle>{texts.banner_title}</CardTitle>
            <CardDescription>{texts.banner_description}</CardDescription>
          </CardHeader>
          <CardFooter className="flex-col sm:flex-row gap-2">
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => saveConsent({ necessary: true, functional: false, statistics: false, marketing: false, consent_version: texts.consent_version })}>{texts.language.toLowerCase().split('-')[0] === 'da' ? 'Afvis valgfrie' : 'Reject optional'}</Button>
            <Button className="w-full sm:w-auto" onClick={handleAcceptAll}>{texts.accept_all_button}</Button>
            <Button className="w-full sm:w-auto" variant="outline" onClick={handleCustomize}>{texts.customize_button}</Button>
          </CardFooter>
        </Card>
      </div>)}
    {isModalOpen && <CookiePreferencesDialog texts={texts} preferences={preferences} setPreferences={setPreferences}
      open={isModalOpen} onOpenChange={setIsModalOpen} onSave={handleSavePreferences} onAcceptAll={handleAcceptAll} />}
  </>;
}
