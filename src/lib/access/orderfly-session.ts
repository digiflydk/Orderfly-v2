import 'server-only';
import { cookies } from 'next/headers';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError, executeAuthority, type VerifiedIdentity } from './authority';
import { OPSFLY_COOKIE_PREFIX, verifyOpsflyCookie } from './opsfly-login';

export async function verifiedOrderflyIdentity(): Promise<VerifiedIdentity> {
  const session=(await cookies()).get('__session')?.value;
  if(!session)throw new AuthorityError('unauthorized',401);
  try {
    if(session.startsWith(OPSFLY_COOKIE_PREFIX))return await verifyOpsflyCookie(session);
    // Check revocation and disabled accounts, not just the signed expiry.
    const token=await getAdminApp().auth().verifySessionCookie(session,true);
    return {provider:'firebase',subject:token.uid};
  }catch{throw new AuthorityError('unauthorized',401);}
}
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
