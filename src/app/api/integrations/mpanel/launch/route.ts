import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { isValidMachineSecret } from '@/lib/integrations/esmeralda-customer-contract';
import { mpanelAdminEnabled } from '@/lib/mpanel-admin-cutover';
import { AuthorityError } from '@/lib/access/authority';
import { OpsflyLoginError } from '@/lib/access/opsfly-login';
import { checkLaunchAccess, issueLaunch, launchBody, launchNonce } from '@/lib/access/mpanel-launch';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('check'),token:launchNonce}).strict(),
  z.object({action:z.literal('issue'),token:launchNonce,challenge:launchNonce}).strict(),
]);
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request) {
  if(!mpanelAdminEnabled())return reply({error:'not_enabled'},503);
  if(!isValidMachineSecret(process.env.MPANEL_PLATFORM_ADMIN_SECRET,request.headers.get('x-mpanel-platform-secret')))return reply({error:'unauthorized'},401);
  try {
    const input=schema.parse(await launchBody(request)),db=getAdminDb();
    if(input.action==='check'){await checkLaunchAccess(db,input.token);return reply({available:true});}
    return reply(await issueLaunch(db,input.token,input.challenge));
  } catch(error) {
    const status=error instanceof AuthorityError||error instanceof OpsflyLoginError?error.status:error instanceof z.ZodError||error instanceof SyntaxError?400:503;
    return reply({error:status===403||status===401?'forbidden':status===400?'invalid_payload':'service_unavailable'},status);
  }
}
