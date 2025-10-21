

'use client';

import { GTM_ID } from './gtm';
import type { AnalyticsEventName } from '@/types';
import { serverTimestamp } from 'firebase/firestore';

declare global {
  interface Window {
    dataLayer: any[];
  }
}

export const pageview = (url: string) => {
  if (typeof window.dataLayer !== "undefined") {
    window.dataLayer.push({
      event: "pageview",
      page: url,
    });
  } else {
    // console.log({
    //   event: "pageview",
    //   page: url,
    // });
  }
};

export const trackClientEvent = (eventName: AnalyticsEventName, data: Record<string, any>) => {
    // Native tracking via API
    fetch('/api/analytics/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: eventName, params: data }),
        keepalive: true, // Ensures the request is sent even if the page is being unloaded
    }).catch(console.error);

    // Consent-based GTM/GA4 tracking
    const consentCookie = document.cookie.split('; ').find(row => row.startsWith('orderfly_cookie_consent='));
    if (consentCookie) {
        try {
            const consent = JSON.parse(decodeURIComponent(consentCookie.split('=')[1]));
            if (consent.marketing) {
                const gtmId = data.brandGtmId || GTM_ID;
                if(gtmId && typeof window.dataLayer !== 'undefined') {
                    window.dataLayer.push({
                        event: eventName,
                        ...data,
                    });
                }
            }
        } catch (e) {
            console.error('Failed to parse cookie consent for analytics:', e);
        }
    }
};

export const trackServerEvent = async (eventName: AnalyticsEventName, props: Record<string, any>) => {
  // This is a placeholder for a more robust server-side tracking solution.
  // In a real-world scenario, you might use a dedicated library or a direct API call to your analytics service.
  // For now, we'll just log it to the console.
  console.log(`[SERVER EVENT]: ${eventName}`, props);

  // Example of how you might send to a server-side API if one existed:
  // await fetch('https://your-analytics-service.com/track', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ eventName, ...props, timestamp: new Date().toISOString() }),
  // });
};
