

'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Allergen } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';

const allergenSchema = z.object({
  id: z.string().optional(),
  allergenName: z.string().min(2, { message: 'Allergen name must be at least 2 characters.' }),
  icon: z.string().optional(),
  isActive: z.preprocess((val) => val === 'on' || val === true, z.boolean()),
});

export type FormState = {
  message: string;
  error: boolean;
};

export async function createOrUpdateAllergen(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = allergenSchema.safeParse(rawData);

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

  const { id, ...allergenData } = validatedFields.data;
  const db = getAdminDb();

  try {
    const allergenRef = id ? db.collection('allergens').doc(id) : db.collection('allergens').doc();
    await allergenRef.set({ ...allergenData, id: allergenRef.id }, { merge: true });

  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save allergen: ${errorMessage}`, error: true };
  }
  
  revalidatePath('/superadmin/allergens');
  redirect('/superadmin/allergens');
}

export async function deleteAllergen(allergenId: string) {
    try {
        const db = getAdminDb();
        await db.collection("allergens").doc(allergenId).delete();
        revalidatePath("/superadmin/allergens");
        return { message: "Allergen deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete allergen: ${errorMessage}`, error: true };
    }
}

export async function getAllergens(): Promise<Allergen[]> {
  const db = getAdminDb();
  const q = db.collection('allergens').orderBy('allergenName');
  const querySnapshot = await q.get();
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Allergen[];
}
