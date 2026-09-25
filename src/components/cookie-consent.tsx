
'use client';

import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { optionalGet, optionalSet } from '@/lib/optional-storage';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from './ui/dialog';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { useCookieTexts } from '@/hooks/use-cookie-texts';
import { Separator } from './ui/separator';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
import { Badge } from './ui/badge';
import type { AnonymousCookieConsent } from '@/types';
import { saveConsentChoice, retryPendingConsent } from '@/lib/consent-sync';

interface CookieConsentProps {
  brandId: string;
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

function CookieCategory({ title, description, checked, onCheckedChange, disabled = false }: { title: string, description: string, checked: boolean, onCheckedChange?: (checked: boolean) => void, disabled?: boolean }) {
    return (
        <div className="space-y-2">
            <div className="flex items-start justify-between">
                <div className="flex-1 pr-4">
                    <h4 className="font-semibold text-base">{title}</h4>
                </div>
                {disabled ? (
                     <Badge variant="outline" className="text-green-600 border-green-600">Altid Aktiv</Badge>
                ) : (
                    <Switch
                        checked={checked}
                        onCheckedChange={onCheckedChange}
                        disabled={disabled}
                        aria-label={title}
                    />
                )}
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
    )
}

export function CookieConsent({ brandId, isModalOpen, setIsModalOpen }: CookieConsentProps) {
  const [showBanner, setShowBanner] = useState(false);
  const { texts, loading } = useCookieTexts({ brandId });
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined' && texts.consent_version) {
        let existingConsentCookie = optionalGet(CONSENT_COOKIE_NAME);
        try { existingConsentCookie ||= Cookies.get(CONSENT_COOKIE_NAME) || null; } catch { /* No consent inferred. */ }
        if (existingConsentCookie) {
            try {
                // Ensure the cookie string is a valid JSON before parsing.
                if (existingConsentCookie.trim().startsWith('{') && existingConsentCookie.trim().endsWith('}')) {
                    const parsedConsent = JSON.parse(existingConsentCookie);
                    if (parsedConsent.consent_version !== texts.consent_version) {
                        setShowBanner(true);
                    } else {
                        setShowBanner(false);
                    }
                } else {
                    // Cookie is present but invalid, force banner.
                    setShowBanner(true);
                }
            } catch (e) {
                console.error("Failed to parse cookie:", e);
                setShowBanner(true);
            }
        } else {
            // No cookie found.
            setShowBanner(true);
        }
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

  return (
    <>
      <div className={cn("fixed bottom-0 left-0 right-0 z-50 p-4 transform-gpu transition-transform duration-300", showBanner ? "translate-y-0" : "translate-y-full")}>
         <Card className="w-full max-w-4xl mx-auto shadow-xl">
          <CardHeader>
            <CardTitle>{texts.banner_title}</CardTitle>
            <CardDescription>{texts.banner_description}</CardDescription>
          </CardHeader>
          <CardFooter className="flex-col sm:flex-row gap-2">
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => saveConsent({ necessary: true, functional: false, statistics: false, marketing: false, consent_version: texts.consent_version })}>Afvis valgfrie</Button>
            <Button className="w-full sm:w-auto" onClick={handleAcceptAll}>{texts.accept_all_button}</Button>
            <Button className="w-full sm:w-auto" variant="outline" onClick={handleCustomize}>{texts.customize_button}</Button>
          </CardFooter>
        </Card>
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl p-0">
          <DialogHeader className="p-6 pb-4">
            <DialogTitle className="text-2xl">{texts.modal_title}</DialogTitle>
            <DialogDescription>{texts.modal_description}</DialogDescription>
          </DialogHeader>
          <Separator />
          <div className="px-6 py-4 space-y-4">
             <CookieCategory
                title={compatCategories.necessary.title}
                description={compatCategories.necessary.description}
                checked={true}
                disabled
             />
              <Separator />
               <CookieCategory
                title={compatCategories.functional.title}
                description={compatCategories.functional.description}
                checked={preferences.functional}
                onCheckedChange={(checked) => setPreferences(p => ({...p, functional: checked}))}
              />
               <Separator />
              <CookieCategory
                title={compatCategories.statistics.title}
                description={compatCategories.statistics.description}
                checked={preferences.statistics}
                onCheckedChange={(checked) => setPreferences(p => ({...p, statistics: checked}))}
              />
               <Separator />
              <CookieCategory
                title={compatCategories.marketing.title}
                description={compatCategories.marketing.description}
                checked={preferences.marketing}
                onCheckedChange={(checked) => setPreferences(p => ({...p, marketing: checked}))}
              />
          </div>
          <DialogFooter className="p-6 bg-muted/50 border-t flex-col sm:flex-row gap-2">
            <Button variant="outline" className="w-full sm:w-auto h-11" onClick={handleSavePreferences}>{texts.save_preferences_button}</Button>
            <Button className="w-full sm:w-auto h-11" onClick={handleAcceptAll}>{texts.modal_accept_all_button}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
