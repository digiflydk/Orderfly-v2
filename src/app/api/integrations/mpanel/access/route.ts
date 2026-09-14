import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { isValidMachineSecret } from '@/lib/integrations/esmeralda-customer-contract';
import { mpanelAdminEnabled } from '@/lib/mpanel-admin-cutover';
import { authorityCommandSchema, AuthorityError, executeAuthority } from '@/lib/access/authority';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=20;
const envelope=z.object({actorId:z.string().uuid(),organizationId:z.string().uuid(),command:authorityCommandSchema}).strict();
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request:Request) {
  if(!mpanelAdminEnabled())return reply({error:'not_enabled'},503);
  if(!isValidMachineSecret(process.env.MPANEL_PLATFORM_ADMIN_SECRET,request.headers.get('x-mpanel-platform-secret')))return reply({error:'unauthorized'},401);
  const actor=process.env.MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID,organization=process.env.MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID;
  if(!z.string().uuid().safeParse(actor).success||!z.string().uuid().safeParse(organization).success)return reply({error:'configuration_missing'},503);
  try {
    const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
    if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>20000)return reply({error:'invalid_payload'},400);chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const input=envelope.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    // The bridge authenticates the employee's native session; the authority
    // derives its canonical principal and loads current grants itself.
    const result=await executeAuthority(getAdminDb(),{provider:'opsfly',subject:input.actorId,organizationId:input.organizationId},input.command,
      {provider:'opsfly',subject:actor!,organizationId:organization!});
    return reply(result);
  }catch(error){
    if(error instanceof AuthorityError)return reply({error:error.code},error.status);
    if(error instanceof z.ZodError||error instanceof SyntaxError)return reply({error:'invalid_payload'},400);
    return reply({error:'service_unavailable'},503);
  }
}
