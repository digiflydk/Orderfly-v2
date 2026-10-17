import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { loginLinkSchema, requestLoginLink } from '@/lib/loyalty/stamp-card/membership';
import { deliverLoyaltyMail } from '@/lib/loyalty/stamp-card/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ brandSlug: string }> };

export function POST(request: Request, params: Params) {
  return portalRoute(request, params, { schema: loginLinkSchema, run: async ({ db, brand, input, context }) => {
    const { mailJob } = await requestLoginLink(db, brand, input, context);
    if (mailJob) await deliverLoyaltyMail(db, mailJob).catch(() => null);
    return { body: { ok: true } };
  } });
}
