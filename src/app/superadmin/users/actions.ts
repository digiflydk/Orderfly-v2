
'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, getDoc } from 'firebase/firestore';
import { z } from 'zod';
import type { User } from '@/types';

const userSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, 'Name must be at least 2 characters.'),
  email: z.string().email('Invalid email address.'),
  roleIds: z.array(z.string()).optional().default([]),
});

export type FormState = {
  message: string;
  error: boolean;
};

export async function createOrUpdateUser(
  prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const rawData: Record<string, any> = Object.fromEntries(formData.entries());
  rawData.roleIds = formData.getAll('roleIds');
  
  const validatedFields = userSchema.safeParse(rawData);

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

  const { id, ...userData } = validatedFields.data;
  
  const userId = id || doc(collection(db, 'users')).id;
  
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, { id: userId, ...userData }, { merge: true });
    
    revalidatePath('/superadmin/users');
    revalidatePath('/superadmin/brands'); // Revalidate brands in case owner names changed
    return { message: `User ${id ? 'updated' : 'created'} successfully.`, error: false };
  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save user: ${errorMessage}`, error: true };
  }
}

export async function deleteUser(userId: string) {
    try {
        await deleteDoc(doc(db, "users", userId));
        revalidatePath("/superadmin/users");
        revalidatePath('/superadmin/brands');
        return { message: "User deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete user: ${errorMessage}`, error: true };
    }
}

export async function getUsers(): Promise<User[]> {
    const q = query(collection(db, 'users'), orderBy('name'));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[];
}

export async function getUserById(id: string): Promise<User | null> {
    const docRef = doc(db, 'users', id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        return { id: docSnap.id, ...docSnap.data() } as User;
    }
    return null;
}
