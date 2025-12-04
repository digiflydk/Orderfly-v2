
'use server';

import 'server-only';
import { requireSuperadmin } from '@/lib/auth/superadmin';
import { getAdminDb } from '@/lib/firebase-admin';
import type { User } from '@/types';

export interface SuperadminUser {
  id: string | null;
  email: string | null;
  role: string | null;
  name?: string;
}

/**
 * Gets the current superadmin user context.
 * In a real app, this would involve fetching session data.
 * For now, it leverages the mock implementation in hasPermission.
 */
export async function getSuperadminUserContext(): Promise<SuperadminUser> {
  try {
    // This is a placeholder for a real session check.
    // In a real app, you would replace this with something like:
    // const session = await getSession();
    // const user = session?.user;
    const user = await requireSuperadmin();

    if (user) {
      // Assuming `user` object has at least an `email` and optionally `name`.
      // The `uid` in a real scenario would come from the auth session.
      const db = getAdminDb();
      const userQuery = await db.collection('users').where('email', '==', (user as any).email).limit(1).get();
      
      if (!userQuery.empty) {
        const userData = userQuery.docs[0].data() as User;
        return {
          id: userQuery.docs[0].id,
          email: userData.email,
          name: userData.name,
          role: 'superadmin', // Assuming check passes
        };
      }
    }
  } catch (e) {
    // If requireSuperadmin throws or user not found, we fall back.
    // This will now return a structured null-state object instead of an error.
  }

  // Fallback for unauthenticated or non-existent user
  return {
    id: null,
    email: null,
    role: null,
    name: undefined,
  };
}
