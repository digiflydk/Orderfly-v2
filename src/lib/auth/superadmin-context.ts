
'use server';

import 'server-only';
import { getAdminApp } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';

export interface SuperadminUser {
	id: string | null;
	email: string | null;
	role: string | null;
	name?: string;
}

/** Returns the verified caller, never a different account from the directory. */
export async function getSuperadminUserContext(): Promise<SuperadminUser> {
  try {
    const session=await orderflySession();
    const user=await getAdminApp().auth().getUser(session.identity.subject);
    return {id:user.uid,email:user.email||null,name:user.displayName||session.name,role:session.superuser?'superadmin':'company_user'};
  } catch { return {id:null,email:null,role:null}; }
}
