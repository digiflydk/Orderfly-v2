import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { logout } from '@/lib/loyalty/stamp-card/membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ brandSlug: string }> };

export function POST(request: Request, params: Params) {
  return portalRoute(request, params, { session: true, run: async ({ db, session, context }) => ({ body: await logout(db, session!, context.now), setSession: null }) });
}
