import type { AsyncPageProps } from "@/types/next-async-props";
import { resolveSearchParams } from "@/lib/next/resolve-props";
import { notFound, redirect } from 'next/navigation';
import { getOrderDetails } from '@/app/superadmin/sales/orders/[orderId]/page';
import { getActiveFeedbackQuestionsForExperience } from './actions';
import { FeedbackFormClient } from './form-client';
import { resolveBookingFeedbackInvitationToken } from '@/lib/integrations/esmeralda-feedback-integration';
import { getAdminDb } from '@/lib/firebase-admin';
import type { FeedbackSourceContext } from '@/lib/feedback/source-types';

export const revalidate = 0;

export default async function Page({ searchParams }: AsyncPageProps) {
  const query = await resolveSearchParams(searchParams);
  const token = typeof query.token === 'string' ? query.token : undefined;

  if (token) {
    const invitation = await resolveBookingFeedbackInvitationToken(token);
    if (!invitation) notFound();
    if (invitation.status === 'submitted') redirect('/feedback/thank-you');

    const db = getAdminDb();
    const brandSnapshot = await db.collection('brands').doc(invitation.organization_id).get();
    if (!brandSnapshot.exists) notFound();
    const brand = brandSnapshot.data() ?? {};

    const questionsVersion = await getActiveFeedbackQuestionsForExperience('booking');
    if (!questionsVersion) {
      return <div className="flex items-center justify-center min-h-screen"><p>No active feedback form available at the moment.</p></div>;
    }

    const context: FeedbackSourceContext = {
      sourceType: 'booking',
      sourceId: invitation.booking_id,
      customerId: invitation.customer_id,
      locationId: invitation.location_id,
      brandId: invitation.organization_id,
      brandName: typeof brand.name === 'string' ? brand.name : 'Restaurant',
      brandLogoUrl: typeof brand.logoUrl === 'string' ? brand.logoUrl : null,
      displayReference: invitation.starts_at
        ? new Date(invitation.starts_at).toLocaleString('da-DK')
        : invitation.booking_id,
      experienceType: 'booking',
      invitationToken: token,
    };

    return (
      <div className="min-h-screen bg-muted/40 py-8">
        <FeedbackFormClient context={context} questionsVersion={questionsVersion} />
      </div>
    );
  }

  const orderId = typeof query.orderId === 'string' ? query.orderId : undefined;
  const customerId = typeof query.customerId === 'string' ? query.customerId : undefined;
  if (!orderId || !customerId) notFound();

  const order = await getOrderDetails(orderId);
  if (!order || order.customerDetails.id !== customerId) notFound();

  const questionsVersion = await getActiveFeedbackQuestionsForExperience(
    order.deliveryType.toLowerCase() as 'pickup' | 'delivery',
  );
  if (!questionsVersion) {
    return <div className="flex items-center justify-center min-h-screen"><p>No active feedback form available at the moment.</p></div>;
  }

  const context: FeedbackSourceContext = {
    sourceType: 'commerce_order',
    sourceId: order.id,
    customerId: order.customerDetails.id,
    locationId: order.locationId,
    brandId: order.brandId,
    brandName: order.brandName,
    brandLogoUrl: order.brandLogoUrl,
    displayReference: order.id,
    experienceType: order.deliveryType.toLowerCase() as 'pickup' | 'delivery',
  };

  return (
    <div className="min-h-screen bg-muted/40 py-8">
      <FeedbackFormClient context={context} questionsVersion={questionsVersion} />
    </div>
  );
}
