import { merchantRoute } from '@/lib/loyalty/stamp-card/http';
import { redeemReward, redeemSchema } from '@/lib/loyalty/stamp-card/counter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return merchantRoute(request, redeemSchema, redeemReward);
}
