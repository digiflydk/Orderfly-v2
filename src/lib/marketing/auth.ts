import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { getAdminApp } from '@/lib/firebase-admin';
import { cookies } from 'next/headers';
export function workerAuthorized(request: Request) {
    const secret = process.env.ORDERFLY_MARKETING_WORKER_SECRET;
    const supplied = request.headers.get('authorization') || '';
    if (!secret || secret.length < 32 || supplied.length > 512)
        return false;
    const a = Buffer.from(`Bearer ${secret}`), b = Buffer.from(supplied);
    return a.length === b.length && timingSafeEqual(a, b);
}
// Do not use the legacy hasPermission placeholder for access to consent data.
// Accept an already-established, revoked-checked Firebase admin session only.
export async function marketingAdminAuthorized() {
    const allowed = (process.env.ORDERFLY_MARKETING_ADMIN_UIDS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!allowed.length)
        return false;
    const cookie = (await cookies()).get('__session')?.value;
    if (!cookie)
        return false;
    try {
        const session = await getAdminApp().auth().verifySessionCookie(cookie, true);
        return allowed.includes(session.uid);
    }
    catch {
        return false;
    }
}
