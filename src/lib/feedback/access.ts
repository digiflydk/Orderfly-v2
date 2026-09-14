import 'server-only';
import { cookies } from 'next/headers';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { executeAuthority, type VerifiedIdentity } from '@/lib/access/authority';

export type FeedbackAccess = { uid: string; permissions: string[]; brandIds: string[] | null };
export class FeedbackAccessError extends Error {
  constructor() { super('Log ind med en bruger, der har adgang til feedback.'); }
}

// Kept for the existing layout while its historical environment banner is retired.
export function temporaryFeedbackTestAccessEnabled() { return false; }

/** The UID must come from a revoked-checked Firebase token, never request input. */
export async function feedbackAccessForUid(uid: string, permission = 'feedback:view'): Promise<FeedbackAccess> {
  if (!['feedback:view','feedback:edit','settings:view','settings:edit'].includes(permission)) throw new FeedbackAccessError();
  const identity: VerifiedIdentity = {provider:'firebase',subject:uid};
  const bootstrap: VerifiedIdentity = {provider:'opsfly',subject:process.env.MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID||'',organizationId:process.env.MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID||''};
  try {
    const db=getAdminDb();
    const session=await executeAuthority(db,identity,{action:'session'},bootstrap);
    if (!('superuser' in session)) throw new FeedbackAccessError();
    if (session.superuser) return {uid,permissions:['feedback:view','feedback:edit','settings:view','settings:edit'],brandIds:null};
    // Question versions are global; a company grant cannot edit them.
    if (permission.startsWith('settings:')) throw new FeedbackAccessError();
    const result=await executeAuthority(db,identity,{action:'nativeGrants',product:'orderfly',permission:'orderfly.'+permission},bootstrap);
    if (!('grants' in result)) throw new FeedbackAccessError();
    // The current feedback aggregate combines locations, so it requires a
    // company-wide grant. A selected-location grant must never expand here.
    const brandIds=(result.grants as Array<{tenantId:string;locationIds:string[]|null}>).filter(g=>g.locationIds===null).map(g=>g.tenantId);
    if (!brandIds.length) throw new FeedbackAccessError();
    return {uid,permissions:[permission],brandIds:[...new Set(brandIds)]};
  } catch { throw new FeedbackAccessError(); }
}

export async function requireFeedbackAccess(permission = 'feedback:view'): Promise<FeedbackAccess> {
  const cookie=(await cookies()).get('__session')?.value;
  if (!cookie) throw new FeedbackAccessError();
  try {
    const token=await getAdminApp().auth().verifySessionCookie(cookie,true);
    return await feedbackAccessForUid(token.uid,permission);
  } catch { throw new FeedbackAccessError(); }
}

export function assertFeedbackBrand(access: FeedbackAccess, brandId: unknown): asserts brandId is string {
  if (typeof brandId !== 'string' || !/^[\w-]{1,160}$/.test(brandId) || (access.brandIds !== null && !access.brandIds.includes(brandId))) throw new FeedbackAccessError();
}

export async function requireQuestionAccess(edit = false) {
  const access=await requireFeedbackAccess(edit?'settings:edit':'settings:view');
  if (access.brandIds!==null) throw new FeedbackAccessError();
  return access;
}
