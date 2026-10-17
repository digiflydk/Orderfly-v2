import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { memberQrToken } from '@/lib/loyalty/stamp-card/membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ brandSlug: string }> };

export function GET(request: Request, params: Params) {
  return portalRoute(request, params, { session: true, run: async ({ db, brand, session, context }) => ({ body: await memberQrToken(db, brand, session!, context.now) }) });
}
