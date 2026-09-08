// Allowlist shared by browser and server. No customer fields, URL/query,
// receipt/payment capabilities, free text or full analytics payloads are retained.
const clientEvents = ['view_menu', 'view_product', 'add_to_cart', 'start_checkout', 'customer_info_started',
  'delivery_method_selected', 'click_purchase', 'order_confirmed_view', 'upsell_offer_shown', 'upsell_accepted', 'upsell_rejected', 'newsletter_opt_in_selected', 'combo_upgrade_accepted', 'web_vital'];
export function metricPayload(name: unknown, input: Record<string, unknown> = {}, trusted = false): ({name: string} & Record<string, string | number>) | null {
  if (typeof name !== 'string' || !(clientEvents.includes(name) || trusted && ['payment_session_created', 'payment_succeeded'].includes(name))) return null;
  const data: Record<string, string | number> = {};
  const id = /^[a-zA-Z0-9_-]{1,160}$/;
  for (const key of ['brandId','locationId','sessionId','eventId','productId','upsellId','metricId']) {
    if (typeof input[key] === 'string' && id.test(input[key] as string)) data[key] = input[key] as string;
  }
  for (const key of ['cartValue','itemsCount','value']) if (typeof input[key] === 'number' && Number.isFinite(input[key]) && input[key] >= 0 && input[key] <= 1e9) data[key] = input[key];
  if (trusted && typeof input.orderId === 'string' && id.test(input.orderId)) data.orderId = input.orderId;
  if (input.deviceType === 'mobile' || input.deviceType === 'desktop') data.deviceType = input.deviceType;
  if (input.deliveryType === 'pickup' || input.deliveryType === 'delivery') data.deliveryType = input.deliveryType;
  if (['landing','menu','checkout','receipt','cancel','other'].includes(input.pageType as string)) data.pageType = input.pageType as string;
  if (['LCP','INP','CLS'].includes(input.metricName as string)) data.metricName = input.metricName as string;
  if (typeof input.release === 'string' && /^(?:[a-f0-9]{7,40}|unknown|local)$/.test(input.release)) data.release = input.release;
  if (name === 'web_vital' && (!data.metricName || !data.metricId || data.value === undefined)) return null;
  return {name, ...data};
}
export function commercePage(path: string) {
  if (path.includes('/superadmin') || path.startsWith('/api/') || path.includes('/admin')) return 'other';
  if (path.includes('/checkout/confirmation')) return 'receipt';
  if (path.includes('/checkout/cancel')) return 'cancel';
  if (path.includes('/checkout')) return 'checkout';
  return path.split('/').filter(Boolean).length >= 2 && !path.startsWith('/brand-site') ? 'menu' : 'landing';
}
