import 'server-only';
import { cookies } from 'next/headers';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError, executeAuthority, type VerifiedIdentity } from './authority';

export async function verifiedOrderflyIdentity(): Promise<VerifiedIdentity> {
  const session=(await cookies()).get('__session')?.value;
  if(!session)throw new AuthorityError('unauthorized',401);
  try {
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
