import 'server-only';
import { orderflySession } from '@/lib/access/orderfly-session';
import { ALL_PERMISSIONS } from '@/lib/permissions';

// Legacy global administration affects the whole platform. Company operations
// use requireOrderflyAccess with their real brand and location instead.
export async function hasPermission(permission:string):Promise<boolean> {
  if(!ALL_PERMISSIONS.some(p=>p.id===permission))return false;
  try{return (await orderflySession()).superuser;}catch{return false;}
}
