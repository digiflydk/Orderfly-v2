'use client';

import { useEffect } from 'react';
import type { Brand } from '@/types';
import { statisticsAllowed } from '@/lib/analytics';
import { mountBrandTracking } from '@/lib/brand-tracking-frame';

export function BrandTracking({ brand }: { brand: Brand }) {
  useEffect(() => {
    let stop: (() => void) | undefined;
    const updateConsent = () => {
      if (!statisticsAllowed()) { stop?.(); stop = undefined; }
      else if (!stop) stop = mountBrandTracking(brand);
    };
    updateConsent();
    window.addEventListener('orderfly:consent', updateConsent);
    return () => { window.removeEventListener('orderfly:consent', updateConsent); stop?.(); };
  }, [brand.id, brand.gtmContainerId, brand.ga4MeasurementId, brand.googleAdsConversionId, brand.googleAdsPurchaseLabel, brand.metaPixelId]);
  return null;
}
