import 'server-only';
import { cookies } from 'next/headers';
import { getAdminApp } from '@/lib/firebase-admin';
import { hasPermission } from '@/lib/permissions';
import { z } from 'zod';

export type FeedbackAccess = { uid: string; permissions: string[]; brandIds: string[] | null };
export class FeedbackAccessError extends Error {
  constructor() { super('Log ind med en administrator, der har adgang til feedback.'); }
}

export function temporaryFeedbackTestAccessEnabled() {
  return process.env.ORDERFLY_FEEDBACK_TEST_ACCESS === 'enabled-for-dummy-data';
}
const grant = z.object({
  uid: z.string().min(1).max(128),
  role: z.enum(['platform_admin', 'brand_editor', 'brand_viewer']),
  brandIds: z.array(z.string().regex(/^[\w-]{1,160}$/)).max(50).default([]),
}).strict().refine(value => value.role === 'platform_admin' || value.brandIds.length > 0);

/** Server configuration is authoritative while legacy user/role editors remain unprotected. */
export async function feedbackAccessForUid(uid: string): Promise<FeedbackAccess> {
  try {
    const grants = z.array(grant).max(100).parse(JSON.parse(process.env.ORDERFLY_FEEDBACK_ACCESS || '[]'));
    if (new Set(grants.map(g => g.uid)).size !== grants.length) throw new FeedbackAccessError();
    const entry = grants.find(g => g.uid === uid);
    if (!entry) throw new FeedbackAccessError();
    return { uid,
      permissions: entry.role === 'platform_admin' ? ['feedback:view', 'feedback:edit', 'settings:view', 'settings:edit'] : entry.role === 'brand_editor' ? ['feedback:view', 'feedback:edit'] : ['feedback:view'],
      brandIds: entry.role === 'platform_admin' ? null : [...new Set(entry.brandIds)],
    };
  } catch { throw new FeedbackAccessError(); }
}

export async function requireFeedbackAccess(permission = 'feedback:view'): Promise<FeedbackAccess> {
  if (temporaryFeedbackTestAccessEnabled() && hasPermission('users:view')) {
    const access = { uid: 'temporary-feedback-test-access', permissions: ['feedback:view', 'feedback:edit', 'settings:view', 'settings:edit'], brandIds: null };
    if (!access.permissions.includes(permission)) throw new FeedbackAccessError();
    return access;
  }
  const cookie = (await cookies()).get('__session')?.value;
  if (!cookie) throw new FeedbackAccessError();
  try {
    const token = await getAdminApp().auth().verifySessionCookie(cookie, true);
    const access = await feedbackAccessForUid(token.uid);
    if (!access.permissions.includes(permission)) throw new FeedbackAccessError();
    return access;
  } catch { throw new FeedbackAccessError(); }
}

export function assertFeedbackBrand(access: FeedbackAccess, brandId: unknown): asserts brandId is string {
  if (typeof brandId !== 'string' || !/^[\w-]{1,160}$/.test(brandId) || (access.brandIds !== null && !access.brandIds.includes(brandId))) throw new FeedbackAccessError();
}

export async function requireQuestionAccess(edit = false) {
  const access = await requireFeedbackAccess(edit ? 'settings:edit' : 'settings:view');
  // Question versions are currently shared by all brands.
  if (access.brandIds !== null) throw new FeedbackAccessError();
  return access;
}
