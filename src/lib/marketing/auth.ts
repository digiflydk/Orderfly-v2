import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
export function workerAuthorized(request: Request) {
    const secret = process.env.ORDERFLY_MARKETING_WORKER_SECRET;
    const supplied = request.headers.get('authorization') || '';
    if (!secret || secret.length < 32 || supplied.length > 512)
        return false;
    const a = Buffer.from(`Bearer ${secret}`), b = Buffer.from(supplied);
    return a.length === b.length && timingSafeEqual(a, b);
}
// Administrative consent data follows the current central authority.
export async function marketingAdminAuthorized() {
    try { await requirePlatformSuperuser(); return true; }
    catch { return false; }
}
