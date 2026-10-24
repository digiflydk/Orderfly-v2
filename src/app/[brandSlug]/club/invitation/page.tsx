import { portalBase } from '../data';
import { DiscountInvitationFlow } from './invitation-flow';
export default async function DiscountInvitationPage({params}:{params:Promise<{brandSlug:string}>}) {
 const {brandSlug}=await params;
 return <DiscountInvitationFlow slug={brandSlug} base={await portalBase(brandSlug)}/>;
}
