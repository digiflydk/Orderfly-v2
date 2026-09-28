import 'server-only';
import { redirect } from 'next/navigation';
import { AuthorityError } from './authority';
import { orderflyReadGrants } from './orderfly-session';

// A parent layout can redirect while its RSC page is already rendering. Guard
// the page's own reads as well, so an expired session cannot turn a navigation
// into a generic Server Components error. Keep other failures visible to ops.
export async function loadSuperadminPage<T>(permission: string, load: () => Promise<T>): Promise<T | null> {
  try {
    await orderflyReadGrants(permission);
    return await load();
  } catch (error) {
    if (error instanceof AuthorityError) {
      if (error.status === 401) redirect('/admin-login');
      if (error.status === 403) return null;
    }
    throw error;
  }
}
