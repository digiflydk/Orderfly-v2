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
    const text=await request.text();
    if(text.length>20000) return reply({error:'invalid_payload'},400);
    const input=envelopeSchema.parse(JSON.parse(text));
    if(input.actorId!==actor||input.organizationId!==organization) return reply({error:'forbidden'},403);
    return reply(await executePlatformAdmin(input));
  } catch(error) {
    if(error instanceof PlatformAdminError) return reply({error:error.code},error.status);
    if(error instanceof z.ZodError||error instanceof SyntaxError) return reply({error:'invalid_payload'},400);
    return reply({error:'service_unavailable'},503);
  }
}
