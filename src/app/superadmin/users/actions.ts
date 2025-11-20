

'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import type { User } from '@/types';
import { z } from 'zod';

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
  const db = getAdminDb();
  
  const userId = id || db.collection('users').doc().id;
  
  try {
    const userRef = db.collection('users').doc(userId);
    await userRef.set({ id: userId, ...userData }, { merge: true });
    
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
        const db = getAdminDb();
        await db.collection("users").doc(userId).delete();
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
    const db = getAdminDb();
    const q = db.collection('users').orderBy('name');
    const querySnapshot = await q.get();
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as User[];
}

export async function getUserById(id: string): Promise<User | null> {
    const db = getAdminDb();
    const docRef = db.collection('users').doc(id);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        return { id: docSnap.id, ...docSnap.data() } as User;
    }
    return null;
}
