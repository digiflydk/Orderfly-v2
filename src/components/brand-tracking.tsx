'use client';

import { useEffect } from 'react';
import type { Brand } from '@/types';
import { trackingConsent, clearRejectedTrackingCookies } from '@/lib/analytics';
import { mountBrandTracking } from '@/lib/brand-tracking-frame';

export function BrandTracking({ brand }: { brand: Brand }) {
  useEffect(() => {
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
  }, [brand.id, brand.gtmContainerId, brand.ga4MeasurementId, brand.googleAdsConversionId, brand.googleAdsPurchaseLabel, brand.metaPixelId]);
  return null;
}
