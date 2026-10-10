'use client';
import { useEffect, useState } from 'react';
import { defaultTexts, getDefaultCookieTexts } from '@/lib/cookie-texts';
import { publicRead } from '@/lib/public-read';
export function useCookieTexts({ brandId }: {brandId: string}) {
  const [texts, setTexts] = useState(defaultTexts);
  useEffect(() => {
    let cancelled = false;
    const language = navigator.language;
    const query = new URLSearchParams({brandId, language});
    setTexts(getDefaultCookieTexts(language));
    publicRead<typeof defaultTexts>(`/api/public/cookie-texts?${query}`).then(result => {
      if (!cancelled) setTexts(result);
    }).catch(() => { /* Safe defaults remain visible. */ });
    return () => { cancelled = true; };
  }, [brandId]);
  return {texts, loading: false};
}
