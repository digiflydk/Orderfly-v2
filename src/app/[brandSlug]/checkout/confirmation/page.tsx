
import { redirect, notFound } from 'next/navigation';
import { getOrderById, getOrderByCheckoutSessionId } from '@/app/checkout/order-actions';
import { getLocationById } from '@/app/superadmin/locations/actions';

export default async function LegacyConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: { session_id?: string; order_id?: string };
}) {
  const { brandSlug } = await params;
  const sessionId = searchParams?.session_id;
  const orderId = searchParams?.order_id;

  if (!sessionId && !orderId) {
    // If we have neither, we can't look up the order, so redirect to brand page as a fallback.
    redirect(`/${brandSlug}`);
  }
  
  // Try to find the order using the most reliable ID we have.
  const order = orderId 
    ? await getOrderById(orderId) 
    : await getOrderByCheckoutSessionId(sessionId!);

  if (!order) {
    // If order still not found, a graceful fallback.
    // In a production environment, you might show a "we're processing your order" page.
    redirect(`/${brandSlug}`);
  }
  
  const location = await getLocationById(order.locationId);
  if (!location) {
    // Should not happen if data is consistent, but a safe check.
    notFound();
  }

  // Construct the full, correct URL and redirect.
  // We prioritize the session_id from the original request if it exists.
  const finalSessionId = sessionId || order.psp?.checkoutSessionId;
  const confirmationUrl = `/${brandSlug}/${location.slug}/checkout/confirmation?order_id=${order.id}&session_id=${finalSessionId}`;
  redirect(confirmationUrl);
}
