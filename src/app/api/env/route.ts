import { requireSuperadminApi } from '@/lib/auth/superadmin-api';
export async function GET(){
  const denied = await requireSuperadminApi();
  if (denied) return denied;
  const safe = { NODE: process.version, PREVIEW: process.env.NEXT_PUBLIC_M3_PREVIEW ?? "(unset)" };
  return new Response(JSON.stringify(safe,null,2), { headers:{ "content-type":"application/json"}});
}
