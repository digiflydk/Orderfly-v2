import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { inspectDiscountInvitation, inspectDiscountInvitationSchema } from '@/lib/loyalty/discount-card/invitations';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export function POST(request:Request,params:{params:Promise<{brandSlug:string}>}) {
 return portalRoute(request,params,{schema:inspectDiscountInvitationSchema,run:async({db,brand,input,context})=>({body:{ok:true,...await inspectDiscountInvitation(db,brand,input,context)}})});
}
