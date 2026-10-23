'use server';

import { revalidatePath } from 'next/cache';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError } from '@/lib/access/authority';
import { requirePlatformSuperuser } from '@/lib/access/orderfly-session';
import { saveSignupNotificationsSchema } from '@/lib/loyalty/stamp-card/signup-notification-rules';
import { saveSignupNotifications } from '@/lib/loyalty/stamp-card/signup-notifications';

export async function saveSignupNotificationAction(input: unknown) {
  try {
    const session = await requirePlatformSuperuser();
    const parsed = saveSignupNotificationsSchema.safeParse(input);
    if (!parsed.success) return { ok: false as const, error: 'invalid_settings' };
    const data = await saveSignupNotifications(getAdminDb(), { identity: session.identity, name: session.name }, parsed.data, Date.now());
    revalidatePath('/superadmin/loyalty/stamp-card');
    return { ok: true as const, data };
  } catch (error) {
    return { ok: false as const, error: error instanceof AuthorityError ? error.code : 'unavailable' };
  }
}
