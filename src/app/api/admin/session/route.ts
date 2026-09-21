import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getAdminApp, getAdminDb } from '@/lib/firebase-admin';
import { executeAuthority, type VerifiedIdentity } from '@/lib/access/authority';
import { getOrigin } from '@/lib/url';
import { createOpsflyCookie, loginOpsfly, logoutOpsfly, OPSFLY_COOKIE_PREFIX, OpsflyLoginError, readOpsflyCookie } from '@/lib/access/opsfly-login';

export const runtime = 'nodejs';
const opsflyInput=z.object({provider:z.literal('opsfly'),identifier:z.string().trim().min(2).max(160),pin:z.string().regex(/^\d{6}$/)}).strict();
const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};
const bootstrapIdentity=():VerifiedIdentity=>({provider:'opsfly',subject:process.env.MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID||'',organizationId:process.env.MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID||''});
async function checkAccess(identity:VerifiedIdentity) {
  const access=await executeAuthority(getAdminDb(),identity,{action:'session'},bootstrapIdentity());
  if(!('permissions' in access)||!('superuser' in access)||(!access.superuser&&!access.permissions.some((p:string)=>p.startsWith('orderfly.'))))throw new Error();
}
export async function POST(request: Request) {
  if(request.headers.get('origin')!==await getOrigin())return NextResponse.json({error:'Forbidden'},{status:403});
  try {
    const reader=request.body?.getReader(),chunks:Uint8Array[]=[];let size=0;
    if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>12000)return NextResponse.json({error:'Invalid request'},{status:400});chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(input?.provider==='opsfly') {
      const parsed=opsflyInput.safeParse(input);
      if(!parsed.success)return NextResponse.json({error:'Kontrollér brugernavn og PIN.'},{status:400});
      const native=await loginOpsfly(parsed.data.identifier,parsed.data.pin);
      try {
        await checkAccess(native.identity);
        const cookie=createOpsflyCookie(native.token,native.expires_at);
        const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
        response.cookies.set('__session',cookie.value,{...cookieOptions,maxAge:cookie.maxAge});
        return response;
      } catch(error) {await logoutOpsfly(native.token).catch(()=>{});throw error;}
    }
    const {idToken}=input;
    if(typeof idToken!=='string'||idToken.length>10000)throw new Error();
    const auth=getAdminApp().auth();
    const decoded=await auth.verifyIdToken(idToken,true);
    if(typeof decoded.auth_time!=='number'||Math.abs(Date.now()/1000-decoded.auth_time)>300)throw new Error();
    await checkAccess({provider:'firebase',subject:decoded.uid});
    const expiresIn=8*60*60*1000;
    const session=await auth.createSessionCookie(idToken,{expiresIn});
    const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
    response.cookies.set('__session',session,{...cookieOptions,maxAge:expiresIn/1000});
    return response;
  } catch(error) {
    const status=error instanceof OpsflyLoginError?error.status:403;
    const message=status===429?'For mange forsøg. Vent 10 minutter og prøv igen.':status===503?'Login er midlertidigt utilgængeligt. Prøv igen.':'Login blev afvist. Kontrollér din konto og din adgang i mPanel.';
    return NextResponse.json({error:message},{status,headers:{'Cache-Control':'no-store'}});
  }
}
export async function DELETE(request:Request) {
  if(request.headers.get('origin')!==await getOrigin())return NextResponse.json({error:'Forbidden'},{status:403});
  const value=(await cookies()).get('__session')?.value;
  if(value?.startsWith(OPSFLY_COOKIE_PREFIX)) {
    let token:string|undefined;
    try{token=readOpsflyCookie(value);}catch{/* Invalid or expired local sessions can simply be cleared. */}
    if(token)try{await logoutOpsfly(token);}catch(error){
      if(!(error instanceof OpsflyLoginError)||error.status!==403)return NextResponse.json({error:'Kunne ikke logge ud. Prøv igen.'},{status:503,headers:{'Cache-Control':'no-store'}});
    }
  }
  const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  response.cookies.set('__session','',{...cookieOptions,maxAge:0});
  return response;
}
