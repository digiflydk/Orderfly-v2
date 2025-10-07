
import { redirect, notFound } from 'next/navigation';
import { getOrderById, getOrderByCheckoutSessionId } from '@/app/checkout/order-actions';
import { getLocationById } from '@/app/superadmin/locations/actions';

export const runtime = "nodejs";

export default async function CheckoutConfirmationPage(props: any) {
  // OF-537: defensive props handling (Next may pass Promise<any>)
  const rawParams = (props && typeof props === "object") ? (props as any).params : undefined;
  const rawSearch = (props && typeof props === "object") ? (props as any).searchParams : undefined;
  const params = await Promise.resolve(rawParams ?? {});
  const searchParams = await Promise.resolve(rawSearch ?? {});

  const brandSlug = typeof params.brandSlug === "string" ? params.brandSlug : undefined;
  const sessionId = typeof searchParams.session_id === "string" ? searchParams.session_id : undefined;
  const orderId = typeof searchParams.order_id === "string" ? searchParams.order_id : undefined;


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
