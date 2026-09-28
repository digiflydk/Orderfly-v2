import { qualifyingOrders } from '@/lib/loyalty/model';
import type { OrderDetail } from '@/types';

export type CustomerOrderRow = { id: string; brandId: string; merchant: string; date: string | null; status: string; amount: number; feedback: boolean };
export type CustomerFeedbackRow = { id: string; brandId: string; merchant: string; date: string | null; rating: number | null; comment: string };
export type CustomerGameRow = { id: string; brandId: string; merchant: string; campaign: string; date: string | null; optedIn: boolean; externalOrders: number; externalSpend: number };
export type CustomerProductRow = { key: string; name: string; merchant: string; quantity: number };
export type NewsletterRow = { brandId: string; merchant: string; status: 'subscribed' | 'pending' | 'not_subscribed' | 'unknown'; note: string };

// Only settled, non-cancelled orders count. Keep identical dish IDs separate by merchant.
export function topCustomerProducts(orders: OrderDetail[], names: Map<string, string>): CustomerProductRow[] {
  const counts = new Map<string, CustomerProductRow>();
  for (const order of qualifyingOrders(orders)) {
    if (!Array.isArray(order.productItems)) continue;
    for (const item of order.productItems) {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const quantity = Number(item.quantity);
      if (!name || !Number.isSafeInteger(quantity) || quantity <= 0) continue;
      const key = `${order.brandId}\n${item.id || name.toLowerCase()}`;
      const current = counts.get(key);
      if (current) current.quantity += quantity;
      else counts.set(key, { key, name, merchant: names.get(order.brandId) || order.brandId, quantity });
    }
  }
  return [...counts.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name)).slice(0, 10);
}

export function newsletterStatus(contact: { state?: string; providerStatus?: string } | undefined, customerConsent: boolean, gameStates: string[]): Pick<NewsletterRow, 'status' | 'note'> {
  if (contact?.providerStatus === 'unsubscribed' || contact?.state === 'suppressed') return { status: 'not_subscribed', note: 'Unsubscribed or suppressed' };
  if (contact?.providerStatus === 'subscribed') return { status: 'subscribed', note: 'Confirmed by provider' };
  if (contact?.state === 'synced' || gameStates.some(state => state === 'synced' || state === 'accepted')) return { status: 'subscribed', note: 'Last successful sync; current provider status may have changed' };
  if (gameStates.includes('suppressed')) return { status: 'not_subscribed', note: 'Game consent was suppressed' };
  if (contact?.state === 'pending' || contact?.state === 'failed' || customerConsent || gameStates.some(state => state === 'pending' || state === 'failed' || state === 'uncertain')) return { status: 'pending', note: 'Consent recorded; subscription not confirmed' };
  return { status: 'unknown', note: 'No newsletter opt-in recorded here' };
}
