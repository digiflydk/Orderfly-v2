
'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { SubscriptionPlan } from '@/types';
import { z } from 'zod';

const planSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, { message: 'Plan name must be at least 2 characters.' }),
  priceMonthly: z.coerce.number().min(0, { message: 'Price must be a positive number.' }),
  priceYearly: z.coerce.number().min(0, { message: 'Price must be a positive number.' }),
  serviceFee: z.coerce.number().min(0).max(100, { message: 'Service fee must be between 0 and 100.' }),
  isActive: z.preprocess((val) => val === 'on', z.boolean()),
  isMostPopular: z.preprocess((val) => val === 'on', z.boolean()),
});

export type FormState = {
  message: string;
  error: boolean;
};

export async function createOrUpdatePlan(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = planSchema.safeParse(rawData);

  if (!validatedFields.success) {
    console.error(validatedFields.error.flatten());
    const errorMessages = Object.entries(validatedFields.error.flatten().fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
    return {
      message: 'Validation failed: ' + errorMessages,
      error: true,
    };
  }

  const { id, ...planData } = validatedFields.data;

  try {
    const planRef = id ? doc(db, 'subscription_plans', id) : doc(collection(db, 'subscription_plans'));
    await setDoc(planRef, { ...planData, id: planRef.id }, { merge: true });

    revalidatePath('/superadmin/subscriptions');
    return { message: `Plan ${id ? 'updated' : 'created'} successfully.`, error: false };
  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save plan: ${errorMessage}`, error: true };
  }
}

export async function deletePlan(planId: string) {
    try {
        await deleteDoc(doc(db, "subscription_plans", planId));
        revalidatePath("/superadmin/subscriptions");
        return { message: "Plan deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete plan: ${errorMessage}`, error: true };
    }
}
