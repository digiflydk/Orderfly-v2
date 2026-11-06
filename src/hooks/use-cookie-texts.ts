'use client';
import { useEffect, useState } from 'react';
import { defaultTexts, getDefaultCookieTexts, STOREFRONT_COOKIE_LANGUAGE, type PublicCookieTexts } from '@/lib/cookie-texts';
import { publicRead } from '@/lib/public-read';
export function useCookieTexts({ brandId, initialTexts }: {brandId: string; initialTexts?: PublicCookieTexts}) {
  const [texts, setTexts] = useState(initialTexts ?? defaultTexts);
  useEffect(() => {
    if (initialTexts) { setTexts(initialTexts); return; }
    let cancelled = false;
    // The storefront is Danish, so the banner is too, whatever the browser's language.
    const language = STOREFRONT_COOKIE_LANGUAGE;
    const query = new URLSearchParams({brandId, language});
    setTexts(getDefaultCookieTexts(language));
    publicRead<typeof defaultTexts>(`/api/public/cookie-texts?${query}`).then(result => {
      if (!cancelled) setTexts(result);
    }).catch(() => { /* Safe defaults remain visible. */ });
    return () => { cancelled = true; };
  }, [brandId, initialTexts]);
  return {texts, loading: false};
}
