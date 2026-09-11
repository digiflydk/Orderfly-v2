'use client';
import type { AnalyticsEventName } from '@/types';
import { metricPayload, commercePage } from './commerce-metrics';
import { optionalGet } from './optional-storage';
declare global { interface Window { dataLayer: any[]; } }
export function statisticsAllowed() {
  try {
    const cookie = document.cookie.split('; ').find(row => row.startsWith('orderfly_cookie_consent='));
    const raw = optionalGet('orderfly_cookie_consent') || (cookie ? decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)) : null);
    const consent = raw ? JSON.parse(raw) : {};
    return consent.statistics === true || consent.analytics === true;
  } catch { return false; }
}
export function trackClientEvent(eventName: AnalyticsEventName | 'web_vital', data: Record<string, any>): boolean {
  try {
    if (!statisticsAllowed()) return false;
    const payload = metricPayload(eventName, {...data, eventId: crypto.randomUUID(), release: process.env.NEXT_PUBLIC_RELEASE_SHA || 'unknown'});
    if (!payload) return false;
    void fetch('/api/analytics/collect', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: eventName, params: payload}), keepalive: true, signal: AbortSignal.timeout(3000)}).catch(() => {});
    // Preserve existing GTM integrations with the same consented, narrow payload.
    try { window.dataLayer?.push({event: eventName, ...payload}); } catch { /* Optional. */ }
    return true;
  } catch { return false; }
}
export function pushPaidPurchase(data: {orderId: string; value: number; brandId: string; locationId: string; googleAdsSendTo?: string; items: Array<{id?: string; quantity: number; unitPrice: number}>}) {
  try {
    if (!statisticsAllowed() || !/^[a-zA-Z0-9_-]{1,160}$/.test(data.orderId)) return false;
    const key = `orderfly_purchase_${data.orderId}`;
    if (sessionStorage.getItem(key)) return false;
    const ecommerce = {
      transaction_id: data.orderId, value: data.value, currency: 'DKK',
      affiliation: data.brandId, location_id: data.locationId,
      items: data.items.map((item, index) => ({ item_id: item.id || `line-${index + 1}`, quantity: item.quantity, price: item.unitPrice })),
    };
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: 'purchase', ecommerce });
    if (data.googleAdsSendTo) window.dataLayer.push(['event', 'conversion', {
      send_to: data.googleAdsSendTo, value: data.value, currency: 'DKK', transaction_id: data.orderId,
    }]);
    window.fbq?.('track', 'Purchase', { value: data.value, currency: 'DKK' }, { eventID: data.orderId });
    sessionStorage.setItem(key, '1');
    return true;
  } catch { return false; }
}
export const pageview = (url: string) => {
  try { if (statisticsAllowed()) window.dataLayer?.push({event: 'pageview', page_type: commercePage(url.split('?')[0])}); } catch { /* Optional analytics. */ }
};
export const trackServerEvent = async () => { /* Server emitters use analytics-server. */ };
