
import type { AppTypes } from "@/types/next-async-props";
import { resolveParams, resolveSearchParams } from "@/lib/next/resolve-props";
import { notFound } from 'next/navigation';
import { getOrderDetails } from '@/app/superadmin/sales/orders/[orderId]/page';
import { getActiveFeedbackQuestionsForOrder } from './actions';
import { FeedbackFormClient } from './form-client';

export const revalidate = 0;

export default async function Page({ params, searchParams }: AppTypes.AsyncPageProps) {
  const routeParams = await resolveParams(params);
  const query = await resolveSearchParams(searchParams);

  const orderId = typeof query.orderId === 'string' ? query.orderId : undefined;
  const customerId = typeof query.customerId === 'string' ? query.customerId : undefined;

  if (!orderId || !customerId) {
    notFound();
  }

  const order = await getOrderDetails(orderId);
  if (!order || order.customerDetails.id !== customerId) {
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
