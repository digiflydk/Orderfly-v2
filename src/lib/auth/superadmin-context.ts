'use server';

import 'server-only';
import { requireSuperadmin } from '@/lib/auth/superadmin';

export interface SuperadminUser {
  id: string | null;
  email: string | null;
  role: string | null;
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
      return {
        id: (user as any).id ?? null,
        email: (user as any).email ?? null,
        role: 'superadmin',
      };
    }
  } catch {
    // If requireSuperadmin throws (or session is null), we fall back.
  }

  return {
    id: null,
    email: null,
    role: 'superadmin',
  };
}
