import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb, getAdminFieldValue } from '@/lib/firebase-admin';
import { AuthorityError, principalKey } from '@/lib/access/authority';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { resolveKdsScope } from './kds-scope';
import { getOrderTerminalActor, authorizeOrderTerminalTransaction } from '@/lib/terminal-auth/access';
import { kdsSettingsSchema, parseKdsSettings } from './kds-settings';
const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const schema = z.object({ brandId: id, locationId: id, settings: kdsSettingsSchema, expectedRevision: z.number().int().nonnegative(), requestId: z.string().uuid() }).strict();
export class KdsSettingsError extends Error { constructor(public status: number) { super('kds_settings_conflict'); } }
export async function saveKdsSettings(input: unknown, source: 'kds' | 'terminal') {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new KdsSettingsError(400);
  const command = parsed.data, db = getAdminDb();
  const scope = source === 'kds' ? await resolveKdsScope() : null;
  if (scope && !scope.locations.some(row => row.brandId === command.brandId && row.locationId === command.locationId)) throw new AuthorityError('forbidden');
  const actor = source === 'terminal' ? await getOrderTerminalActor('terminal') : null;
  const actorId = actor?.actorId ?? principalKey(scope!.identity);
  const fingerprint = createHash('sha256').update(JSON.stringify(command)).digest('hex');
  const audit = db.collection('auditLogs').doc(createHash('sha256').update(`kds-settings/${actorId}/${command.requestId}`).digest('hex'));
  return db.runTransaction(async tx => {
    const ref = db.collection('locations').doc(command.locationId), location = (await tx.get(ref)).data();
    if (!location || location.brandId !== command.brandId) throw new AuthorityError('forbidden');
    if (actor) await authorizeOrderTerminalTransaction(tx, actor, command);
    else await authorizeTransaction(tx, scope!.identity, command, 'orderfly.orders:edit', 'location');
    const previous = (await tx.get(audit)).data();
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new KdsSettingsError(409);
      return { success: true, revision: previous.revision };
    }
    const revision = location.kdsSettingsRevision ?? 0;
    if (revision !== command.expectedRevision || !Number.isSafeInteger(revision + 1)) throw new KdsSettingsError(409);
    // Only a print lead-time change may reopen the collection window for held jobs.
    const printTimingChanged = parseKdsSettings(location.kdsSettings).preorderMinutes !== command.settings.preorderMinutes;
    tx.update(ref, { kdsSettings: command.settings, kdsSettingsRevision: revision + 1, ...(printTimingChanged ? { kdsSettingsChangedAt: Date.now() } : {}) });
    tx.create(audit, { action: 'kds_settings_changed', actorId, fingerprint, brandId: command.brandId, locationId: command.locationId, settings: command.settings, revision: revision + 1, createdAt: getAdminFieldValue().serverTimestamp() });
    return { success: true, revision: revision + 1 };
  });
}
