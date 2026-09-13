'use client';
import type { AnalyticsEventName } from '@/types';
import { metricPayload, commercePage } from './commerce-metrics';
import type { BrandTrackingEvent } from './brand-tracking-frame';
import { optionalGet } from './optional-storage';
declare global { interface Window { dataLayer: any[]; orderflyPendingTracking?: BrandTrackingEvent[]; } }
export function trackingConsent() {
  try {
    const cookie = document.cookie.split('; ').find(row => row.startsWith('orderfly_cookie_consent='));
    const raw = optionalGet('orderfly_cookie_consent') || (cookie ? decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)) : null);
    const consent = raw ? JSON.parse(raw) : {};
    return { statistics: consent.statistics === true || consent.analytics === true, marketing: consent.marketing === true };
  } catch { return { statistics: false, marketing: false }; }
}
export const statisticsAllowed = () => trackingConsent().statistics;
export const marketingAllowed = () => trackingConsent().marketing;
export function clearRejectedTrackingCookies(consent: { statistics: boolean; marketing: boolean }) {
  try {
    if (!consent.statistics && !consent.marketing) window.orderflyPendingTracking = [];
    const names = document.cookie.split('; ').map(row => row.split('=')[0]);
    const domains = window.location.hostname.split('.').map((_, index, parts) => parts.slice(index).join('.'));
    for (const name of names) {
      const analytics = /^(orderfly_session_id(?:_|$)|orderfly_attribution(?:_|$)|_ga(?:_|$)|_gid$|_gat)/.test(name);
      const marketing = /^(_fbp$|_fbc$|_gcl_)/.test(name);
      if (!(analytics && !consent.statistics || marketing && !consent.marketing)) continue;
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
      for (const domain of domains) document.cookie = `${name}=; Max-Age=0; Path=/; Domain=${domain}; SameSite=Lax`;
    }
  } catch { /* Cookie access can be unavailable. */ }
}
export function trackClientEvent(eventName: AnalyticsEventName | 'web_vital', data: Record<string, any>): boolean {
  try {
    const consent = trackingConsent();
    if (!consent.statistics && !consent.marketing) return false;
    const payload = metricPayload(eventName, {...data, eventId: crypto.randomUUID(), release: process.env.NEXT_PUBLIC_RELEASE_SHA || 'unknown'});
    if (!payload) return false;
    if (!consent.marketing) { delete payload.gclid; delete payload.gbraid; delete payload.wbraid; delete payload.fbclid; }
    if (consent.statistics) void fetch('/api/analytics/collect', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({name: eventName, params: payload}), keepalive: true, signal: AbortSignal.timeout(3000)}).catch(() => {});
    if (typeof payload.brandId === 'string') {
      // Only catalog identifiers and numeric commerce values cross into third-party tags.
      const items = Array.isArray(data.items) ? data.items.slice(0, 200).flatMap((item: any) =>
        typeof item?.item_id === 'string' && /^[a-zA-Z0-9_-]{1,160}$/.test(item.item_id)
          ? [{ item_id: item.item_id, quantity: Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : 1,
              ...(Number.isFinite(item.price) && item.price >= 0 ? { price: item.price } : {}) }] : []) : undefined;
      const event: BrandTrackingEvent = { ...payload, event: eventName, brandId: payload.brandId, currency: /^[A-Z]{3}$/.test(data.currency) ? data.currency : 'DKK',
        ...(items ? { items } : {}), pagePath: window.location.pathname, destinations: consent };
      if (window.orderflyBrandTracker?.brandId === payload.brandId) window.orderflyBrandTracker.emit(event);
      else {
        window.orderflyPendingTracking ||= [];
        if (window.orderflyPendingTracking.length < 50) window.orderflyPendingTracking.push(event);
      }
    }
    return true;
  } catch { return false; }
}
export function pushPaidPurchase(data: {orderId: string; value: number; brandId: string; locationId: string; currency?: string; googleAdsSendTo?: string; items: Array<{id?: string; name?: string; quantity: number; unitPrice: number}>}) {
  try {
    const consent = trackingConsent();
    const tracker = window.orderflyBrandTracker;
    if ((!consent.statistics && !consent.marketing) || tracker?.brandId !== data.brandId || !tracker.ready || !/^[a-zA-Z0-9_-]{1,160}$/.test(data.orderId)) return false;
    const key = `orderfly_purchase_${data.brandId}_${data.orderId}`;
    const destinations = { statistics: consent.statistics && tracker.statistics && !sessionStorage.getItem(key + '_statistics'), marketing: consent.marketing && tracker.marketing && !sessionStorage.getItem(key + '_marketing') };
    if (!destinations.statistics && !destinations.marketing) return false;
    const ecommerce = {
      transaction_id: data.orderId, value: data.value, currency: data.currency || 'DKK',
      affiliation: data.brandId, location_id: data.locationId,
      items: data.items.map((item, index) => ({ item_id: item.id || `line-${index + 1}`, ...(typeof item.name === 'string' && item.name.trim() ? { item_name: item.name.trim().slice(0, 200) } : {}), quantity: item.quantity, price: item.unitPrice })),
    };
    tracker.emit({ event: 'purchase', brandId: data.brandId, ecommerce, destinations });
    if (destinations.statistics) sessionStorage.setItem(key + '_statistics', '1');
    if (destinations.marketing) sessionStorage.setItem(key + '_marketing', '1');
    return true;
  } catch { return false; }
}
export const pageview = (url: string) => {
  try { if (statisticsAllowed()) window.dataLayer?.push({event: 'pageview', page_type: commercePage(url.split('?')[0])}); } catch { /* Optional analytics. */ }
};
export const trackServerEvent = async () => { /* Server emitters use analytics-server. */ };
