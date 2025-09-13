
import { notFound } from 'next/navigation';
import { getOrderDetails } from '@/app/superadmin/sales/orders/[orderId]/page';
import { getActiveFeedbackQuestionsForOrder } from './actions';
import { FeedbackFormClient } from './form-client';

export const revalidate = 0;

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: { orderId?: string, customerId?: string };
}) {
  if (!searchParams.orderId || !searchParams.customerId) {
    notFound();
  }

  const order = await getOrderDetails(searchParams.orderId);
  if (!order || order.customerDetails.id !== searchParams.customerId) {
    notFound();
  }

  const questionsVersion = await getActiveFeedbackQuestionsForOrder(order.deliveryType);
  if (!questionsVersion) {
    return (
        <div className="flex items-center justify-center min-h-screen">
            <p>No active feedback form available at the moment.</p>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/40 py-8">
        <FeedbackFormClient order={order} questionsVersion={questionsVersion} />
    </div>
  )
}
