import { merchantRoute } from '@/lib/loyalty/stamp-card/http';
import { lookupMember, lookupSchema } from '@/lib/loyalty/stamp-card/counter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return merchantRoute(request, lookupSchema, lookupMember);
}
