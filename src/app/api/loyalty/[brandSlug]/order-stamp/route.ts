import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { orderCelebration } from '@/lib/loyalty/stamp-card/order-celebration';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function GET(request: Request, params: { params: Promise<{ brandSlug: string }> }) {
  return portalRoute(request, params, { session: true, run: async ({ db, brand, session, context }) => ({
    body: { award: await orderCelebration(db, brand, session!, new URL(request.url).searchParams.get('orderId') || '', context.now) },
  }) });
}
