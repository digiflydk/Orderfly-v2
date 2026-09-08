import { requestedDelivery } from './cart-snapshot';
export function deliveryUrl(href: string, mode: 'pickup' | 'delivery') {
  const url = new URL(href);
  url.searchParams.set('deliveryMethod', mode);
  return `${url.pathname}${url.search}${url.hash}`;
}
export function syncDeliveryUrl(mode: 'pickup' | 'delivery') {
  try {
    if (requestedDelivery(window.location.search) !== mode || new URLSearchParams(window.location.search).get('deliveryMethod') === 'takeaway') {
      window.history.replaceState(window.history.state, '', deliveryUrl(window.location.href, mode));
    }
  } catch { /* URL changes may be restricted; retain the current selection. */ }
}
