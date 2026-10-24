import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { acceptDiscountInvitation, acceptDiscountInvitationSchema } from '@/lib/loyalty/discount-card/invitations';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function POST(request:Request,params:{params:Promise<{brandSlug:string}>}) {
 return portalRoute(request,params,{schema:acceptDiscountInvitationSchema,run:async({db,brand,input,context})=>{
  const session=await acceptDiscountInvitation(db,brand,input,context);
  return {body:{ok:true},setSession:{token:session.session,expiresAt:session.expiresAt}};
 }});
}
