import { executeAuthority, AuthorityError } from '@/lib/access/authority';
import { getAdminDb } from '@/lib/firebase-admin';
import { isValidMachineSecret } from '@/lib/integrations/esmeralda-customer-contract';
import { envelopeSchema, executePlatformAdmin, PlatformAdminError } from '@/lib/integrations/mpanel-platform-admin';
import { mpanelAdminEnabled } from '@/lib/mpanel-admin-cutover';
import { z } from 'zod';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=20;
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request) {
  if(!mpanelAdminEnabled()) return reply({error:'not_enabled'},503);
  if(!isValidMachineSecret(process.env.MPANEL_PLATFORM_ADMIN_SECRET,request.headers.get('x-mpanel-platform-secret'))) return reply({error:'unauthorized'},401);
  const actor=process.env.MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID,organization=process.env.MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID;
  if(!actor||!organization) return reply({error:'configuration_missing'},503);
  try {
    const reader=request.body?.getReader();
    const chunks:Uint8Array[]=[];let size=0;
    if(reader) try {
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000)return reply({error:'invalid_payload'},400);chunks.push(value);}
    } finally {await reader.cancel().catch(()=>{});}
    const text=Buffer.concat(chunks).toString('utf8');
    const input=envelopeSchema.parse(JSON.parse(text));
    if(input.actorId!==actor||input.organizationId!==organization) return reply({error:'forbidden'},403);
    const identity={provider:'opsfly' as const,subject:actor,organizationId:organization};
    try {
      const session=await executeAuthority(getAdminDb(),identity,{action:'session'},identity);
      if(!('superuser' in session)||!session.superuser)return reply({error:'forbidden'},403);
    } catch(error) {
      // Before explicit initialization only the original verified bootstrap owner
      // can use the legacy catalogue. Disabled/current principals never fall back.
      if(!(error instanceof AuthorityError)||error.code!=='not_initialized')throw error;
    }
    return reply(await executePlatformAdmin(input));
  } catch(error) {
    if(error instanceof AuthorityError)return reply({error:error.code},error.status);
    if(error instanceof PlatformAdminError) return reply({error:error.code},error.status);
    if(error instanceof z.ZodError||error instanceof SyntaxError) return reply({error:'invalid_payload'},400);
    return reply({error:'service_unavailable'},503);
  }
}
