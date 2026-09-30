'use server';
import { revalidatePath, revalidateTag } from 'next/cache';
import { updateMerchantPaymentMethods } from '@/lib/server/merchant-payment-settings';
import type { LocationPaymentMethods } from '@/lib/merchant-payment-methods';

export async function savePaymentMethods(locationId: string, methods: LocationPaymentMethods) {
  try {
    await updateMerchantPaymentMethods(locationId, methods);
    revalidateTag('storefront');
    revalidatePath('/merchant/payments');
    revalidatePath('/superadmin/locations');
    return { success: true, message: 'Betalingsmetoderne er gemt.' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Betalingsmetoderne kunne ikke gemmes.' };
  }
}
