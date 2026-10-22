import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { profileSchema } from '@/lib/loyalty/stamp-card/profile-rules';
import { updateMemberProfile } from '@/lib/loyalty/stamp-card/profile';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ brandSlug: string }> };

export function POST(request: Request, params: Params) {
  return portalRoute(request, params, { schema: profileSchema, session: true,
    run: async ({ db, brand, session, input, context }) => ({ body: await updateMemberProfile(db, brand, session!, input, context) }) });
}
