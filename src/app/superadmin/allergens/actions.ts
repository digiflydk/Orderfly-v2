

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy } from 'firebase/firestore';
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

  try {
    const allergenRef = id ? doc(db, 'allergens', id) : doc(collection(db, 'allergens'));
    await setDoc(allergenRef, { ...allergenData, id: allergenRef.id }, { merge: true });

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
        await deleteDoc(doc(db, "allergens", allergenId));
        revalidatePath("/superadmin/allergens");
        return { message: "Allergen deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete allergen: ${errorMessage}`, error: true };
    }
}

export async function getAllergens(): Promise<Allergen[]> {
  const q = query(collection(db, 'allergens'), orderBy('allergenName'));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Allergen[];
}
