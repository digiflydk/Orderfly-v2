import 'server-only';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { orderflySession } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { getOrderTerminalActor, authorizeOrderTerminalTransaction } from '@/lib/terminal-auth/access';
import { AuthorityError } from '@/lib/access/authority';
import { storedPrinterSchema } from './storage';
import { credentialSchema } from './device-credential-schema';
import { projectPrinterConnection } from './connection-status';
import { ManualPrintError } from './manual-print-schema';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const merchantPrinterListSchema = z.object({ orderId: id, brandId: id, locationId: id, after: id.optional() }).strict();
/** Order permission grants only a minimal printer picker, never printer administration. */
export async function listMerchantReprintPrinters(input: unknown, terminal = false) {
  const parsed = merchantPrinterListSchema.safeParse(input);
  if (!parsed.success) throw new ManualPrintError('manual_print_invalid');
  const s = parsed.data, actor = terminal ? await getOrderTerminalActor('terminal') : null;
  const session = actor ? null : await orderflySession(), db = getAdminDb();
  return db.runTransaction(async tx => {
    if (actor) await authorizeOrderTerminalTransaction(tx, actor, s);
    else await authorizeTransaction(tx, session!.identity, s, 'orderfly.orders:edit', 'location');
    const [order, brand, location] = await Promise.all([
      tx.get(db.collection('orders').doc(s.orderId)), tx.get(db.collection('brands').doc(s.brandId)), tx.get(db.collection('locations').doc(s.locationId)),
    ]);
    const o = order.data(), b = brand.data(), l = location.data();
    const active = (v: FirebaseFirestore.DocumentData | undefined) => !!v && !v.deleted && !v.isDeleted && !v.deletedAt && !v.isTestData && v.isActive !== false;
    if (!order.exists || o?.brandId !== s.brandId || o?.locationId !== s.locationId || !active(b) || !['active', 'trialing'].includes(b!.status)
      || !active(l) || l!.brandId !== s.brandId) throw new AuthorityError('forbidden');
    let query = db.collection('locations').doc(s.locationId).collection('printers').orderBy('__name__').limit(51);
    if (s.after) query = query.startAfter(s.after);
    const page = await tx.get(query), rows = page.docs.slice(0, 50), items = [];
    for (const row of rows) {
      const parsedPrinter = storedPrinterSchema.safeParse(row.data());
      if (!parsedPrinter.success) continue;
      const p = parsedPrinter.data, c = p.configuration;
      if (c.id !== row.id || c.brandId !== s.brandId || c.locationId !== s.locationId || c.state !== 'active'
        || c.transport !== 'cloudprnt-http' || c.manufacturer !== 'star' || ![58, 80].includes(c.paperWidthMm)) continue;
      const [credentialRow, contact] = await Promise.all([
        tx.get(row.ref.collection('deviceCredentials').doc('current')), tx.get(row.ref.collection('connection').doc('current')),
      ]);
      const credential = credentialSchema.safeParse(credentialRow.data());
      if (!credential.success || credential.data.brandId !== s.brandId || credential.data.locationId !== s.locationId
        || credential.data.printerId !== row.id || credential.data.printerRevision !== p.revision
        || credential.data.revokedAt !== null || credential.data.issuedAt > Date.now()) continue;
      items.push({ configuration: { id: c.id, name: c.name, brandId: c.brandId, locationId: c.locationId, state: c.state, transport: c.transport },
        revision: p.revision, connection: projectPrinterConnection(contact.data(), credential.data, { ...s, printerId: row.id }, p.revision) });
    }
    return { items, nextCursor: page.docs.length > 50 ? rows.at(-1)!.id : null };
  }, { readOnly: true });
}
