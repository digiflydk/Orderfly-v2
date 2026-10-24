import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { memberView } from '@/lib/loyalty/stamp-card/membership';
import { memberDiscountCard } from '@/lib/loyalty/discount-card/portal';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ brandSlug: string }> };

export function GET(request: Request, params: Params) {
  return portalRoute(request, params, { session: true, run: async ({ db, brand, session, context }) => {
    const [view, discountCard] = await Promise.all([memberView(db, brand, session!, context.now), memberDiscountCard(db, brand, session!, context.now)]);
    return { body: { ...view, discountCard } };
  } });
}
