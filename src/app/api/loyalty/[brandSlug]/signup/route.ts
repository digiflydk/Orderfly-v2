import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { signup, signupSchema } from '@/lib/loyalty/stamp-card/membership';
import { deliverLoyaltyMail } from '@/lib/loyalty/stamp-card/mail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ brandSlug: string }> };

export function POST(request: Request, params: Params) {
  return portalRoute(request, params, { schema: signupSchema, run: async ({ db, brand, input, context }) => {
    const { mailJob } = await signup(db, brand, input, context);
    // Best effort: the worker heartbeat retries. The answer is the same whether or not the e-mail was known.
    if (mailJob) await deliverLoyaltyMail(db, mailJob).catch(() => null);
    return { body: { ok: true } };
  } });
}
