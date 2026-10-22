'use client';

import { hasTrackingConsentChoice, trackingConsent } from '@/lib/analytics';
import { QR_TOUCH_QUERY, QR_TOUCH_RECEIPT_PATTERN } from '@/lib/qr/touch-contract';

// The landing URL is the only carrier. Never copy this hint into browser
// storage, a session identifier, UTM fields or a third-party event.
export function clearClubQrTouch() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(QR_TOUCH_QUERY)) return;
    url.searchParams.delete(QR_TOUCH_QUERY);
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch { /* Optional measurement cannot block membership. */ }
}

export function clubQrAttribution() {
  try {
    if (!trackingConsent().statistics) { clearClubQrTouch(); return undefined; }
    const values = new URL(window.location.href).searchParams.getAll(QR_TOUCH_QUERY);
    if (values.length !== 1 || !QR_TOUCH_RECEIPT_PATTERN.test(values[0])) return undefined;
    return { receipt: values[0], statisticsConsent: true as const };
  } catch { return undefined; }
}

export function watchClubQrConsent() {
  // No choice yet is not a rejection: the visible URL may be used after the
  // first choice on this landing. An actual denial/revocation is irreversible
  // for this touch, even if statistics is subsequently reaccepted.
  let hadChoice = hasTrackingConsentChoice();
  const update = () => {
    const hasChoice = hasTrackingConsentChoice();
    if ((hadChoice || hasChoice) && !trackingConsent().statistics) clearClubQrTouch();
    hadChoice ||= hasChoice;
  };
  update();
  const storage = (event: StorageEvent) => {
    // Cart/delivery writes in another tab are not consent decisions. Removing
    // an existing consent (including clear-all) must still discard the touch,
    // even if an older cookie fallback remains readable in this tab.
    if (event.key !== 'orderfly_cookie_consent' && event.key !== null) return;
    if (event.newValue === null && hadChoice) clearClubQrTouch();
    else update();
  };
  window.addEventListener('orderfly:consent', update);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener('orderfly:consent', update);
    window.removeEventListener('storage', storage);
  };
}
