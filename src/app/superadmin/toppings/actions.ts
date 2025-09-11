

'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, writeBatch, where, getDoc } from 'firebase/firestore';
import type { Topping, ToppingGroup } from '@/types';
import { z } from 'zod';
import { redirect } from 'next/navigation';

const toppingGroupSchema = z.object({
  id: z.string().optional(),
  locationIds: z.array(z.string()).min(1, { message: 'At least one location must be selected.' }),
  groupName: z.string().min(2, { message: 'Group name must be at least 2 characters.' }),
  minSelection: z.coerce.number().min(0, "Min selection must be 0 or more."),
  maxSelection: z.coerce.number().min(0, "Max selection must be 0 or more."),
}).refine(data => data.maxSelection === 0 || data.maxSelection >= data.minSelection, {
    message: "Max selection must be 0 (for unlimited) or greater than or equal to min selection.",
    path: ["maxSelection"],
});

const toppingSchema = z.object({
  id: z.string().optional(),
  locationIds: z.array(z.string()).min(1, { message: 'At least one location must be selected.' }),
  groupId: z.string().min(1, { message: 'A topping group must be selected.' }),
  toppingName: z.string().min(2, { message: 'Topping name must be at least 2 characters.' }),
  price: z.coerce.number().min(0, { message: 'Price must be a non-negative number.' }),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.coerce.number().optional(),
});

export type FormState = {
  message: string;
  error: boolean;
};

export async function createOrUpdateToppingGroup(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  const rawData: Record<string, any> = Object.fromEntries(formData.entries());
  
  rawData.locationIds = formData.getAll('locationIds');

  const validatedFields = toppingGroupSchema.safeParse(rawData);

  if (!validatedFields.success) {
    const errorMessages = Object.entries(validatedFields.error.flatten().fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
    return { message: `Validation failed: ${errorMessages || "Check your inputs."}`, error: true };
  }

  const { id, ...groupData } = validatedFields.data;

  try {
    const groupRef = id ? doc(db, 'topping_groups', id) : doc(collection(db, 'topping_groups'));
    await setDoc(groupRef, { ...groupData, id: groupRef.id }, { merge: true });

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save topping group: ${errorMessage}`, error: true };
  }
  revalidatePath('/superadmin/toppings');
  redirect('/superadmin/toppings');
}

export async function deleteToppingGroup(groupId: string) {
    try {
        const batch = writeBatch(db);

        const groupRef = doc(db, "topping_groups", groupId);
        batch.delete(groupRef);

        const toppingsQuery = query(collection(db, "toppings"), where("groupId", "==", groupId));
        const toppingsSnapshot = await getDocs(toppingsQuery);
        toppingsSnapshot.forEach(toppingDoc => {
            batch.delete(toppingDoc.ref);
        });

        await batch.commit();
        
        revalidatePath("/superadmin/toppings");
        return { message: "Topping group and its toppings deleted successfully.", error: false };
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete topping group: ${errorMessage}`, error: true };
    }
}


export async function createOrUpdateTopping(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  
  const rawData: Record<string, any> = {};

  const id = formData.get('id') as string | null;
  if (id) {
    rawData.id = id;
  }
  
  formData.forEach((value, key) => {
      if (key === 'locationIds') {
          if (!rawData[key]) rawData[key] = [];
          (rawData[key] as string[]).push(value as string);
      } else {
          rawData[key] = value;
      }
  });

  rawData.isActive = formData.has('isActive');
  rawData.isDefault = formData.has('isDefault');
  
  const validatedFields = toppingSchema.safeParse(rawData);
  
  if (!validatedFields.success) {
    const errorMessages = Object.entries(validatedFields.error.flatten().fieldErrors)
        .map(([field, errors]) => `${field}: ${errors.join(', ')}`)
        .join('; ');
    return {
      message: `Validation failed: ${errorMessages}`,
      error: true,
    };
  }
  
  const { id: validatedId, ...toppingData } = validatedFields.data;
  
  try {
    const toppingRef = validatedId ? doc(db, 'toppings', validatedId) : doc(collection(db, 'toppings'));
    await setDoc(toppingRef, { ...toppingData, id: toppingRef.id }, { merge: true });

  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save topping: ${errorMessage}`, error: true };
  }

  revalidatePath('/superadmin/toppings');
  redirect('/superadmin/toppings');
}

export async function deleteTopping(toppingId: string) {
    try {
        await deleteDoc(doc(db, "toppings", toppingId));
        revalidatePath("/superadmin/toppings");
        return { message: "Topping deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete topping: ${errorMessage}`, error: true };
    }
}

export async function updateToppingSortOrder(orderedToppings: {id: string, sortOrder: number}[]) {
    try {
        const batch = writeBatch(db);
        orderedToppings.forEach(topping => {
            const docRef = doc(db, 'toppings', topping.id);
            batch.update(docRef, { sortOrder: topping.sortOrder });
        });
        await batch.commit();
        revalidatePath('/superadmin/toppings');
        return { message: 'Topping order updated.', error: false };
    } catch(e) {
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to update topping order: ${errorMessage}`, error: true };
    }
}


export async function getToppingGroups(locationId?: string): Promise<ToppingGroup[]> {
    let q;
    if (locationId) {
        q = query(collection(db, 'topping_groups'), where('locationIds', 'array-contains', locationId));
    } else {
        q = query(collection(db, 'topping_groups'), orderBy('groupName'));
    }
    const querySnapshot = await getDocs(q);
    const groups = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ToppingGroup[];

    // Sort in-memory if locationId is provided to avoid composite index requirement
    if (locationId) {
        return groups.sort((a, b) => a.groupName.localeCompare(b.groupName));
    }
    
    return groups;
}

export async function getToppingGroupById(id: string): Promise<ToppingGroup | null> {
    const docRef = doc(db, 'topping_groups', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as ToppingGroup;
    }
    return null;
}


export async function getToppings(locationId?: string): Promise<Topping[]> {
    let q;
    if (locationId) {
        q = query(
            collection(db, 'toppings'),
            where('locationIds', 'array-contains', locationId),
            where('isActive', '==', true)
        );
    } else {
        q = query(collection(db, 'toppings'), orderBy('toppingName'));
    }
    const querySnapshot = await getDocs(q);
    const toppings = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Topping[];

    // Sort in-memory if locationId is provided to avoid composite index requirement
    if (locationId) {
        return toppings.sort((a, b) => (a.sortOrder || 999) - (b.sortOrder || 999));
    }
    
    return toppings;
}

export async function getToppingById(id: string): Promise<Topping | null> {
    const docRef = doc(db, 'toppings', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as Topping;
    }
    return null;
}
