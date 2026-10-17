import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { verifyLoginLink, verifySchema } from '@/lib/loyalty/stamp-card/membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ brandSlug: string }> };

// POST only: a mail scanner following the link cannot consume the one-time token.
export function POST(request: Request, params: Params) {
  return portalRoute(request, params, { schema: verifySchema, run: async ({ db, brand, input, context }) => {
    const { session, expiresAt } = await verifyLoginLink(db, brand, input, context);
    return { body: { ok: true, expiresAt }, setSession: { token: session, expiresAt } };
  } });
}
