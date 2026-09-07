
'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { LoyaltySettings } from '@/types';

import { scoreSettingsSchema as loyaltySettingsSchema } from '@/lib/loyalty/model';

export type FormState = {
    message: string;
    error: boolean;
};

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  return (await getLoyaltySettingsState()).settings;
}

export async function getLoyaltySettingsState(): Promise<{settings:LoyaltySettings;warning:string|null}> {
  const docRef = doc(db, 'platform_settings', 'loyalty');
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const parsed=loyaltySettingsSchema.safeParse(docSnap.data());
    if(parsed.success)return {settings:parsed.data,warning:null};
  }
  {
    // Return default settings if none are found in the database
    const settings:LoyaltySettings = {
      weights: {
        totalOrders: 30,
        averageOrderValue: 20,
        recency: 25,
        frequency: 15,
        deliveryMethodBonus: 10,
      },
      thresholds: {
        totalOrders: [
          { points: 10, value: 1 },
          { points: 30, value: 3 },
          { points: 60, value: 6 },
          { points: 100, value: 11 },
        ],
        averageOrderValue: [
          { points: 10, value: 0 },
          { points: 50, value: 100 },
          { points: 100, value: 200 },
        ],
        recency: [
          { points: 100, value: 0 },
          { points: 60, value: 8 },
          { points: 30, value: 31 },
          { points: 0, value: 91 },
        ],
        frequency: [
          { points: 100, value: 0 },
          { points: 60, value: 8 },
          { points: 10, value: 31 },
        ],
      },
      deliveryMethodBonus: 10,
      classifications: {
        loyal: { min: 80, max: 100 },
        occasional: { min: 50, max: 79 },
        atRisk: { min: 0, max: 49 },
      },
    };
    return {settings,warning:docSnap.exists()?'De gemte scoreindstillinger er ugyldige. Standardværdier vises, indtil du har rettet og gemt indstillingerne.':null};
  }
}

export async function updateLoyaltySettings(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  
  const rawData = {
    weights: {
        totalOrders: formData.get('weights.totalOrders'),
        averageOrderValue: formData.get('weights.averageOrderValue'),
        recency: formData.get('weights.recency'),
        frequency: formData.get('weights.frequency'),
        deliveryMethodBonus: formData.get('weights.deliveryMethodBonus'),
    },
    thresholds: {
        totalOrders: [
            { points: 10, value: formData.get('thresholds.totalOrders.0.value') },
            { points: 30, value: formData.get('thresholds.totalOrders.1.value') },
            { points: 60, value: formData.get('thresholds.totalOrders.2.value') },
            { points: 100, value: formData.get('thresholds.totalOrders.3.value') },
        ],
        averageOrderValue: [
            { points: 10, value: formData.get('thresholds.averageOrderValue.0.value') },
            { points: 50, value: formData.get('thresholds.averageOrderValue.1.value') },
            { points: 100, value: formData.get('thresholds.averageOrderValue.2.value') },
        ],
        recency: [
            { points: 100, value: formData.get('thresholds.recency.0.value') },
            { points: 60, value: formData.get('thresholds.recency.1.value') },
            { points: 30, value: formData.get('thresholds.recency.2.value') },
            { points: 0, value: formData.get('thresholds.recency.3.value') },
        ],
        frequency: [
            { points: 100, value: formData.get('thresholds.frequency.0.value') },
            { points: 60, value: formData.get('thresholds.frequency.1.value') },
            { points: 10, value: formData.get('thresholds.frequency.2.value') },
        ],
    },
    deliveryMethodBonus: formData.get('deliveryMethodBonus'),
    classifications: {
        loyal: { min: formData.get('classifications.loyal.min'), max: 100 },
        occasional: { min: formData.get('classifications.occasional.min'), max: formData.get('classifications.occasional.max') },
        atRisk: { min: 0, max: formData.get('classifications.atRisk.max') },
    },
  };

  const validatedFields = loyaltySettingsSchema.safeParse(rawData);
  
  if (!validatedFields.success) {
    const errorMessages = Object.entries(validatedFields.error.flatten().fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
    return {
      message: 'Validation failed: ' + errorMessages,
      error: true,
    };
  }

  try {
    await setDoc(doc(db, 'platform_settings', 'loyalty'), validatedFields.data);
    revalidatePath('/superadmin/loyalty');
    return { message: 'Loyalty settings updated successfully.', error: false };
  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to update settings: ${errorMessage}`, error: true };
  }
}
