import type { CartItem } from '@/types';
import { cartChoices } from './cart-snapshot';
// An editor is a draft of one exact line. A stale editor cannot overwrite a
// quantity or option change made while it was open.
export function putCartItem(items: CartItem[], next: CartItem, expected?: CartItem): CartItem[] | null {
    if (expected) {
        const existing = items.find(item => item.cartItemId === expected.cartItemId);
        if (!existing || existing.price !== expected.price || existing.basePrice !== expected.basePrice || JSON.stringify(cartChoices([existing])) !== JSON.stringify(cartChoices([expected])))
            return null;
        return items.map(item => item.cartItemId === expected.cartItemId ? { ...next, cartItemId: item.cartItemId } : item);
    }
    const key = (item: CartItem) => JSON.stringify([item.id, item.price, item.toppings.map(t => [t.id || t.name, t.price]).sort()]);
    const match = next.itemType === 'product' ? items.find(item => item.itemType === 'product' && key(item) === key(next)) : undefined;
    if (match && match.quantity + next.quantity > 100)
        return null;
    return match ? items.map(item => item === match ? { ...item, quantity: item.quantity + next.quantity } : item) : [...items, next];
}
