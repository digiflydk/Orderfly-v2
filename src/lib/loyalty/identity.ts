import 'server-only';
import { getAdminApp } from '@/lib/firebase-admin';

export async function verifiedCustomer(token:string,email?:string) {
  if(!token || token.length>10000)throw new Error('Log ind og bekræft din e-mail først.');
  const claims=await getAdminApp().auth().verifyIdToken(token,true);
  if(!claims.email_verified || !claims.email || (email && claims.email.toLowerCase()!==email.trim().toLowerCase()))throw new Error('Brug den bekræftede e-mail fra din kundekonto.');
  return {uid:claims.uid,email:claims.email.trim().toLowerCase()};
}
export async function requireLoyaltyAdmin(token:string) {
  const identity=await verifiedCustomer(token);
  const allowed=(process.env.LOYALTY_ADMIN_UIDS||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(!allowed.includes(identity.uid))throw new Error('Ingen adgang til loyaltyindstillinger.');
  return identity;
}
