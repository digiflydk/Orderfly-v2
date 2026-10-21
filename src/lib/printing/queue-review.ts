import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { principalKey } from '@/lib/access/authority';
import { verifiedOrderflyIdentity } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';
import { validatePrinterConfiguration } from './configuration';
import { storedPrinterSchema } from './storage';
import { readCanonicalQueueSnapshot } from './queue-snapshot';
import { issuedQueueReviewSchema, QUEUE_REVIEW_TTL_MS } from './queue-review-storage';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const revision = z.number().int().positive().safe();
const commandSchema = z.object({ brandId: id, locationId: id, printerId: id,
  printerRevision: revision, queueRevision: revision, decision: z.literal('resume_empty') }).strict();
export class PrinterQueueReviewError extends Error {
  constructor(readonly code: 'invalid_request' | 'writes_unavailable' | 'not_found'
    | 'record_conflict' | 'queue_review_blocked' | 'queue_not_empty', readonly status: number) { super(code); }
}

/** Issues evidence only. Does not consume it, resume a printer, touch jobs or dispatch. */
export async function issuePrinterQueueReview(input: unknown) {
  const identity = await verifiedOrderflyIdentity();
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) throw new PrinterQueueReviewError('invalid_request', 400);
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') throw new PrinterQueueReviewError('writes_unavailable', 503);
  const command = parsed.data, actorId = principalKey(identity);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const db = getAdminDb(), locationRef = db.collection('locations').doc(command.locationId);
  const printerRef = locationRef.collection('printers').doc(command.printerId);
  return db.runTransaction(async tx => {
    await authorizeTransaction(tx, identity, command, 'orderfly.catalog:edit', 'location');
    const [location, saved] = await Promise.all([tx.get(locationRef), tx.get(printerRef)]);
    const record = saved.exists ? storedPrinterSchema.safeParse(saved.data()) : null;
    if (!record?.success || record.data.configuration.id !== saved.id
      || !validatePrinterConfiguration(record.data.configuration,
        { brandId: command.brandId, locationId: command.locationId },
        { id: location.id, brandId: location.data()?.brandId }).ok) throw new PrinterQueueReviewError('not_found', 404);
    const printerState = record.data.configuration.state;
    if (printerState === 'active' || record.data.revision !== command.printerRevision
      || record.data.revision === Number.MAX_SAFE_INTEGER) throw new PrinterQueueReviewError('record_conflict', 409);
    // Critical: use the SAME write transaction, never the GET service/DTO as authority.
    const snapshot = await readCanonicalQueueSnapshot(tx, printerRef, command);
    if (snapshot.status !== 'verified') throw new PrinterQueueReviewError('queue_review_blocked', 409);
    if (snapshot.queueRevision !== command.queueRevision || snapshot.queueRevision === Number.MAX_SAFE_INTEGER) {
      throw new PrinterQueueReviewError('record_conflict', 409);
    }
    // Initial conservative handling policy: no pending job may be replayed by this decision.
    if (snapshot.summary.pendingCount !== 0) throw new PrinterQueueReviewError('queue_not_empty', 409);
    const expiresAt = snapshot.evaluatedAt + QUEUE_REVIEW_TTL_MS;
    if (!Number.isSafeInteger(expiresAt)) throw new PrinterQueueReviewError('queue_review_blocked', 409);
    const scope = { brandId: command.brandId, locationId: command.locationId, printerId: command.printerId };
    const review = issuedQueueReviewSchema.parse({ schemaVersion: 1, tokenHash, actorId, ...scope,
      printerState, printerRevision: record.data.revision, queueRevision: snapshot.queueRevision,
      decision: command.decision, issuedAt: snapshot.evaluatedAt, expiresAt,
      consumedAt: null, createdAt: FieldValue.serverTimestamp() });
    tx.create(printerRef.collection('queueReviews').doc(tokenHash), review);
    tx.create(printerRef.collection('queueReviewAudit').doc(tokenHash), {
      schemaVersion: 1, action: 'printer.queue_review_issued', tokenHash, actorId, ...scope,
      printerState, printerRevision: review.printerRevision, queueRevision: review.queueRevision,
      decision: review.decision, issuedAt: review.issuedAt, expiresAt, createdAt: review.createdAt,
    });
    return { receipt: token, ...scope, decision: review.decision,
      printerRevision: review.printerRevision, queueRevision: review.queueRevision,
      expiresAt, resumeAuthorized: false as const };
  });
}
