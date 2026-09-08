import { z } from 'zod';
import type { CartItem } from '@/types';

export const CART_STORAGE_KEY = 'orderfly.cart.v1';
export const CART_MAX_AGE = 24 * 60 * 60 * 1000;
const id = z.string().min(1).max(200).refine(value => !value.includes('/'));
export const cartChoiceSchema = z.object({
  id, cartItemId: id, itemType: z.enum(['product', 'combo']),
  quantity: z.number().int().min(1).max(100),
  toppings: z.array(z.string().min(1).max(200)).max(40),
  toppingIds: z.array(id).max(40).optional(),
  offered: z.boolean().default(false),
  comboSelections: z.array(z.object({
    groupName: z.string().min(1).max(200),
    products: z.array(z.object({ id })).max(40),
  })).max(20).optional(),
}).refine(choice => !choice.toppingIds || (choice.toppingIds.length === choice.toppings.length && new Set(choice.toppingIds).size === choice.toppingIds.length), 'Invalid topping identities.');
export const cartChoicesSchema = z.array(cartChoiceSchema).max(100)
  .refine(choices => new Set(choices.map(c => c.cartItemId)).size === choices.length, 'Duplicate cart rows.')
  .refine(choices => choices.reduce((count, c) => count + (c.comboSelections || []).reduce((sum, g) => sum + g.products.length, 0), 0) <= 400, 'Too many combo selections.');
export const cartSnapshotSchema = z.object({
  version: z.literal(1), brandId: id, locationId: id,
  deliveryType: z.enum(['pickup', 'delivery']),
  includeBagFee: z.boolean(), choices: cartChoicesSchema,
  savedAt: z.number().finite(), checkoutOrderId: id.optional(),
});
export type CartChoice = z.infer<typeof cartChoiceSchema>;
export type CartSnapshot = z.infer<typeof cartSnapshotSchema>;
export function cartChoices(items: CartItem[]): CartChoice[] {
  return items.map(item => ({
    id: item.id, cartItemId: item.cartItemId, itemType: item.itemType, quantity: item.quantity,
    toppings: item.toppings.map(topping => topping.name),
    ...(item.toppings.length && item.toppings.every(topping => topping.id) ? { toppingIds: item.toppings.map(topping => topping.id!) } : {}),
    offered: item.price < item.basePrice,
    ...(item.comboSelections ? { comboSelections: item.comboSelections.map(group => ({
      groupName: group.groupName, products: group.products.map(product => ({ id: product.id })),
    })) } : {}),
  }));
}
export function readCartSnapshot(storage: Pick<Storage, 'getItem'>, now = Date.now()): CartSnapshot | null {
  try {
    const raw = storage.getItem(CART_STORAGE_KEY);
    if (!raw || raw.length > 200000) return null;
    const result = cartSnapshotSchema.safeParse(JSON.parse(raw));
    if (!result.success || result.data.savedAt > now + 60000 || now - result.data.savedAt > CART_MAX_AGE) return null;
    return result.data;
  } catch { return null; }
}
export function requestedDelivery(search: string): 'pickup' | 'delivery' | null {
  const value = new URLSearchParams(search).get('deliveryMethod');
  return value === 'delivery' ? 'delivery' : value === 'pickup' || value === 'takeaway' ? 'pickup' : null;
}
