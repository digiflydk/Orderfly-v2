import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { deleteMembership, deleteSchema } from '@/lib/loyalty/stamp-card/membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ brandSlug: string }> };

export function POST(request: Request, params: Params) {
  return portalRoute(request, params, { schema: deleteSchema, session: true,
    run: async ({ db, brand, session, context }) => ({ body: await deleteMembership(db, brand, session!, context.now), setSession: null }) });
}
