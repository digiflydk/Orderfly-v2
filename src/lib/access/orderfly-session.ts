import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError, executeAuthority, type VerifiedIdentity } from './authority';
import { OPSFLY_COOKIE_PREFIX, OpsflyLoginError, verifyOpsflyCookie } from './opsfly-login';

function rejectedFirebaseCookie(error: unknown): boolean {
  const failure = error as { code?: unknown; message?: unknown } | null;
  if (['auth/session-cookie-expired', 'auth/session-cookie-revoked', 'auth/user-disabled',
    'auth/user-not-found', 'auth/invalid-session-cookie'].includes(String(failure?.code))) return true;
  // Admin SDK 13 also wraps certificate-fetch failures as auth/argument-error.
  // Only recognized token-validation messages mean invalid credentials; unknown
  // errors stay unavailable. Never return/log the SDK message or token contents.
  return failure?.code === 'auth/argument-error' && typeof failure.message === 'string'
    && /^(Decoding Firebase session cookie failed\.|Firebase session cookie has |verifySessionCookie\(\) expects |First argument to verifySessionCookie\(\) must be )/.test(failure.message);
}

// React cache is scoped to a single server render, never shared across requests.
// Repeated layout/page/helper checks reuse verification; the next request revalidates.
export const verifiedOrderflyIdentity = cache(async (): Promise<VerifiedIdentity> => {
  const session=(await cookies()).get('__session')?.value;
  if(!session)throw new AuthorityError('unauthorized',401);
  try {
    if(session.startsWith(OPSFLY_COOKIE_PREFIX))return await verifyOpsflyCookie(session);
    // Check revocation and disabled accounts, not just the signed expiry.
    const token=await getAdminApp().auth().verifySessionCookie(session,true);
    return {provider:'firebase',subject:token.uid};
  } catch (error) {
    if (error instanceof AuthorityError && error.status === 401) throw new AuthorityError('unauthorized', 401);
    if (error instanceof OpsflyLoginError && [401, 403].includes(error.status)) throw new AuthorityError('unauthorized', 401);
    if (rejectedFirebaseCookie(error)) throw new AuthorityError('unauthorized', 401);
    throw new AuthorityError('identity_unavailable', 503);
  }
});
export async function requireOrderflyAccess(brandId:string,locationIds:string[]|null,permission:string) {
  const identity=await verifiedOrderflyIdentity();
  const db=getAdminDb();
  const bootstrap:VerifiedIdentity={provider:'opsfly',subject:process.env.MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID||'',organizationId:process.env.MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID||''};
  const decision=await executeAuthority(db,identity,{action:'checkNative',product:'orderfly',tenantId:brandId,locationIds,permission},bootstrap);
  if(!('allowed' in decision)||decision.allowed!==true)throw new AuthorityError('forbidden');
  if(!(await db.collection('brands').doc(brandId).get()).exists)throw new AuthorityError('forbidden');
  // Native location ownership is independently checked. A catalogue typo must
  // not turn a foreign native location into an authorized query boundary.
  if(locationIds!==null)for(const locationId of locationIds){
    const location=await db.collection('locations').doc(locationId).get();
    if(!location.exists||location.data()?.brandId!==brandId)throw new AuthorityError('forbidden');
  }
  return {identity,brandId,locationIds};
}

const bootstrapIdentity=():VerifiedIdentity=>({provider:'opsfly',subject:process.env.MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID||'',organizationId:process.env.MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID||''});
export async function orderflySession():Promise<{identity:VerifiedIdentity;actorId:string;superuser:boolean;name:string;permissions:string[]}> {
  const identity=await verifiedOrderflyIdentity();
  const result=await executeAuthority(getAdminDb(),identity,{action:'session'},bootstrapIdentity());
  if(!('permissions' in result)||!('superuser' in result))throw new AuthorityError('forbidden');
  return {identity,...result};
}
export async function requirePlatformSuperuser() {
  const session=await orderflySession();
  if(!session.superuser)throw new AuthorityError('forbidden');
  return session;
}
export async function orderflyReadGrants(permission:string):Promise<Array<{brandId:string;locationIds:string[]|null}>> {
  const identity=await verifiedOrderflyIdentity(),db=getAdminDb();
  const result=await executeAuthority(db,identity,{action:'nativeGrants',product:'orderfly',permission},bootstrapIdentity());
  if(!('grants' in result))throw new AuthorityError('forbidden');
  const grants:Array<{brandId:string;locationIds:string[]|null}>=[];
  for(const grant of result.grants as Array<{tenantId:string;locationIds:string[]|null}>){
    if(!(await db.collection('brands').doc(grant.tenantId).get()).exists)continue;
    let locationIds:string[]|null=null;
    if(grant.locationIds!==null){
      const locations=await Promise.all(grant.locationIds.map(id=>db.collection('locations').doc(id).get()));
      locationIds=locations.filter(row=>row.exists&&row.data()?.brandId===grant.tenantId).map(row=>row.id);
      if(!locationIds.length)continue;
    }
    grants.push({brandId:grant.tenantId,locationIds});
  }
  if(!grants.length)throw new AuthorityError('forbidden');
  return grants;
}
