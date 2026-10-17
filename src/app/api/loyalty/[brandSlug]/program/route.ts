import { portalRoute } from '@/lib/loyalty/stamp-card/portal-http';
import { programForPortal } from '@/lib/loyalty/stamp-card/membership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Params = { params: Promise<{ brandSlug: string }> };

// Public sign-up information: program status, consent text and terms with their versions.
export function GET(request: Request, params: Params) {
  return portalRoute(request, params, { run: async ({ db, brand }) => ({ body: await programForPortal(db, brand) }) });
}
