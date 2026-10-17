'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import type { Brand } from '@/types';
import { trackingConsent, clearRejectedTrackingCookies } from '@/lib/analytics';
import { mountBrandTracking } from '@/lib/brand-tracking-frame';
import { isClubPath } from '@/lib/loyalty/portal-path';

export function BrandTracking({ brand }: { brand: Brand }) {
  // The stamp card portal shows personal data, login links and QR codes: no third-party tracking there.
  const club = isClubPath(usePathname(), brand.slug);
  useEffect(() => {
    if (club) return;
    let stop: (() => void) | undefined;
    let previous = '';
    const updateConsent = () => {
      const consent = trackingConsent();
      const key = JSON.stringify(consent);
      if (key === previous) return;
      previous = key;
      stop?.(); stop = undefined;
      clearRejectedTrackingCookies(consent);
      if (consent.statistics || consent.marketing) stop = mountBrandTracking(brand, consent);
    };
    updateConsent();
    window.addEventListener('orderfly:consent', updateConsent);
    window.addEventListener('storage', updateConsent);
    return () => { window.removeEventListener('storage', updateConsent); window.removeEventListener('orderfly:consent', updateConsent); stop?.(); };
  }, [club, brand.id, brand.gtmContainerId, brand.ga4MeasurementId, brand.googleAdsConversionId, brand.googleAdsPurchaseLabel, brand.metaPixelId]);
  return null;
}
