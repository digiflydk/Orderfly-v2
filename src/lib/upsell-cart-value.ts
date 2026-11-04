import type { CartItem } from '@/types';
import { ore } from './money';

/**
 * Cart value used for "cart_value_over" upsell triggers. It mirrors the
 * checkout rule in checkout-price-validation.ts: every line (combos included)
 * at its current unit price after standard offers, without options/toppings.
 * Keeping both sides equal prevents showing an offer that checkout rejects.
 */
export function upsellCartValue(items: Pick<CartItem, 'price' | 'basePrice' | 'quantity'>[]): number {
  return items.reduce((sum, item) => sum + Math.min(ore(item.price), ore(item.basePrice)) * item.quantity, 0) / 100;
}
