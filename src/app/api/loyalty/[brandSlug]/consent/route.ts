import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { consentSchema, setNewsletterConsent } from '@/lib/loyalty/stamp-card/membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ brandSlug: string }> };

export function POST(request: Request, params: Params) {
  return portalRoute(request, params, { schema: consentSchema, session: true,
    run: async ({ db, brand, session, input, context }) => ({ body: await setNewsletterConsent(db, brand, session!, input, context.now) }) });
}
