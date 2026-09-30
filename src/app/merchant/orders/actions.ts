'use server';
import { revalidatePath } from 'next/cache';
import { settlePaidPickupOrder } from '@/lib/server/settle-checkout';
import { cancelUnpaidPickupOrder } from '@/lib/server/pickup-orders';
import type { RestaurantPaymentForm } from '@/lib/merchant-payment-methods';

function refresh(orderId: string) {
  for (const path of ['/merchant/orders', '/superadmin/sales/orders', `/superadmin/sales/orders/${orderId}`, '/superadmin/sales/dashboard', '/superadmin/customers']) revalidatePath(path);
}
export async function registerPickupPayment(orderId: string, method: RestaurantPaymentForm) {
  try {
    const changed = await settlePaidPickupOrder(orderId, method); refresh(orderId);
    return { success: true, message: changed ? 'Betalingen er registreret.' : 'Betalingen er allerede registreret.' };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Betalingen kunne ikke registreres.' }; }
}
export async function cancelPickupOrder(orderId: string) {
  try {
    const changed = await cancelUnpaidPickupOrder(orderId); refresh(orderId);
    return { success: true, message: changed ? 'Ordren er annulleret. Rabatreservationen er frigivet.' : 'Ordren er allerede annulleret.' };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Ordren kunne ikke annulleres.' }; }
}
