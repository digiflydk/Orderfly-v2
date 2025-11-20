

'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import type { Role } from '@/types';
import { z } from 'zod';
import { ALL_PERMISSIONS } from '@/lib/permissions';
import { redirect } from 'next/navigation';

const roleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2, { message: 'Role name must be at least 2 characters.' }),
  description: z.string().optional(),
  permissions: z.array(z.string()).refine(
    (perms) => perms.every(p => ALL_PERMISSIONS.some(ap => ap.id === p)),
    { message: 'Invalid permission selected.' }
  ),
});

export type FormState = {
  message: string;
  error: boolean;
};

export async function createOrUpdateRole(
  prevState: FormState | null,
  formData: FormData
): Promise<FormState> {
  const rawData: Record<string, any> = Object.fromEntries(formData.entries());
  rawData.permissions = formData.getAll('permissions');
  const db = getAdminDb();

  const validatedFields = roleSchema.safeParse(rawData);

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

  const { id, ...roleData } = validatedFields.data;

  try {
    const roleRef = id ? db.collection('roles').doc(id) : db.collection('roles').doc();
    await roleRef.set({ ...roleData, id: roleRef.id }, { merge: true });

  } catch (e) {
    console.error(e);
    const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
    return { message: `Failed to save role: ${errorMessage}`, error: true };
  }

  revalidatePath('/superadmin/roles');
  redirect('/superadmin/roles');
}

export async function deleteRole(roleId: string) {
    // Note: In a real app, you'd check if this role is assigned to any users before deleting.
    try {
        const db = getAdminDb();
        await db.collection("roles").doc(roleId).delete();
        revalidatePath("/superadmin/roles");
        return { message: "Role deleted successfully.", error: false };
    } catch (e) {
        console.error(e);
        const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
        return { message: `Failed to delete role: ${errorMessage}`, error: true };
    }
}

export async function getRoles(): Promise<Role[]> {
    const db = getAdminDb();
    const q = db.collection('roles').orderBy('name');
    const querySnapshot = await q.get();
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Role[];
}

export async function getRoleById(roleId: string): Promise<Role | null> {
    const db = getAdminDb();
    const docRef = db.collection('roles').doc(roleId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
        return { id: docSnap.id, ...docSnap.data() } as Role;
    }
    return null;
}
