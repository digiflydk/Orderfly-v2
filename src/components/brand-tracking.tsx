'use client';

import { useEffect } from 'react';
import type { Brand } from '@/types';
import { statisticsAllowed } from '@/lib/analytics';

declare global {
  interface Window {
    dataLayer: any[];
    fbq?: ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue?: unknown[]; loaded?: boolean; version?: string };
  }
}

function addScript(id: string, src: string) {
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id; script.async = true; script.src = src;
  document.head.appendChild(script);
}

export function BrandTracking({ brand }: { brand: Brand }) {
  useEffect(() => {
    const enable = () => {
      if (!statisticsAllowed()) return;
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'orderfly_tracking_ready', brand_id: brand.id, brand_slug: brand.slug });
      if (brand.gtmContainerId) {
        window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
        addScript(`orderfly-gtm-${brand.gtmContainerId}`, `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(brand.gtmContainerId)}`);
      } else if (brand.ga4MeasurementId || brand.googleAdsConversionId) {
        const tagId = brand.ga4MeasurementId || brand.googleAdsConversionId!;
        addScript(`orderfly-google-tag-${tagId}`, `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tagId)}`);
        const gtag = (...args: unknown[]) => window.dataLayer.push(args);
        gtag('js', new Date());
        if (brand.ga4MeasurementId) gtag('config', brand.ga4MeasurementId, { send_page_view: true });
        if (brand.googleAdsConversionId) gtag('config', brand.googleAdsConversionId);
      }
      if (brand.metaPixelId && !window.fbq) {
        const fbq = ((...args: unknown[]) => fbq.callMethod ? fbq.callMethod(...args) : fbq.queue!.push(args)) as NonNullable<Window['fbq']>;
        fbq.queue = []; fbq.loaded = true; fbq.version = '2.0'; window.fbq = fbq;
        addScript('orderfly-meta-pixel', 'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', brand.metaPixelId); fbq('track', 'PageView');
      }
    };
    enable();
    window.addEventListener('orderfly:consent', enable);
    return () => window.removeEventListener('orderfly:consent', enable);
  }, [brand]);
  return null;
}
