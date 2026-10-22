import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { printJobId } from './domain';
import { parseCloudPrntConfirmation } from './cloudprnt-http';
import { verifyNativePrinterDevice } from './device-auth-native';
import { readStoredPrinterActivity } from './activity-metadata';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.number().int().nonnegative().safe().max(8.64e15);
const revision = z.number().int().positive().safe();
const scope = { brandId: id, locationId: id, printerId: id };
const job = z.object({ ...scope, id: digest, orderId: id, kind: z.enum(['kitchen', 'packing']),
  revision: z.literal(0), printerRevision: revision, createdAt: instant }).strict();

/** Private contract ONLY. A reviewed native producer must atomically transfer the
 * pending job/ledger and write this envelope after actual authorized delivery.
 * No producer or HTTP endpoint exists yet; absence from jobs is not transfer proof.
 */
export const deliveredPrintEnvelopeSchema = z.object({
  schemaVersion: z.literal(1), ...scope, state: z.literal('delivered'), job,
  printerRevision: revision, credentialRevision: revision,
  claimDigest: digest, deliveryDigest: digest, contentDigest: digest,
  deliveredAt: instant, expiresAt: instant,
}).strict().refine(row => row.expiresAt > row.deliveredAt && row.job.createdAt <= row.deliveredAt
  && row.job.printerRevision === row.printerRevision
  && row.job.brandId === row.brandId && row.job.locationId === row.locationId
  && row.job.printerId === row.printerId && printJobId(row.job) === row.job.id);

export const confirmedPrintResultSchema = z.object({
  schemaVersion: z.literal(1), ...scope, jobId: digest, state: z.literal('confirmed'),
  printerRevision: revision, credentialRevision: revision, claimDigest: digest,
  deliveryDigest: digest, contentDigest: digest, confirmedAt: instant,
}).strict();

export class NativePrintResultError extends Error {
  constructor(readonly code: 'invalid_print_result' | 'print_result_unavailable') { super(code); }
}
const invalid = (): never => { throw new NativePrintResultError('invalid_print_result'); };
const equalDigest = (a: string, b: string) => timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

/** The future producer and result consumer use the same exact scoped digest.
 * This helper neither creates a claim nor grants delivery/confirmation authority.
 */
export function printDeliveryTokenDigest(kind: 'claim' | 'delivery', value: string,
  binding: { brandId: string; locationId: string; printerId: string; jobId: string }) {
  const valid = z.object({ ...scope, jobId: digest }).strict().safeParse(binding);
  if (!valid.success || !['claim', 'delivery'].includes(kind)
    || typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) return invalid();
  return createHash('sha256').update(JSON.stringify(['orderfly-delivery-v1', kind,
    binding.brandId, binding.locationId, binding.printerId, binding.jobId, value])).digest('hex');
}

function command(input: unknown) {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return invalid();
    const fields = ['brandId', 'locationId', 'printerId', 'jobId', 'secret', 'claimToken', 'query'];
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) return invalid();
    const copy: Record<string, string> = {};
    for (const key of fields) {
      const d = Object.getOwnPropertyDescriptor(input, key);
      if (!d || !('value' in d) || typeof d.value !== 'string' || d.value.length > (key === 'query' ? 2048 : 128)) return invalid();
      copy[key] = d.value;
    }
    const parsed = z.object({ ...scope, jobId: digest,
      secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      claimToken: z.string().regex(/^[A-Za-z0-9_-]{43}$/), query: z.string().max(2048) }).strict().safeParse(copy);
    if (!parsed.success) return invalid();
    const confirmation = parseCloudPrntConfirmation(parsed.data.query);
    if (confirmation.outcome !== 'confirmed') return invalid();
    return { ...parsed.data, confirmation };
  } catch { return invalid(); }
}

/** Internal, unwired service. Only the explicit 200/OK device acknowledgement
 * with matching private delivered identity can materialize confirmed usage.
 * Never called from create/resume/poll/download/simulator. No output is enabled.
 */
export async function persistNativePrintConfirmation(input: unknown) {
  const request = command(input);
  try {
    const db = getAdminDb();
    return await db.runTransaction(async transaction => {
      const identity = await verifyNativePrinterDevice({ db, transaction }, {
        brandId: request.brandId, locationId: request.locationId, printerId: request.printerId, secret: request.secret,
      }); // Fresh native authentication before ANY private delivery/result read.
      const printerRef = db.collection('locations').doc(identity.locationId).collection('printers').doc(identity.printerId);
      const deliveryRef = printerRef.collection('deliveries').doc(request.jobId);
      const resultRef = printerRef.collection('printResults').doc(request.jobId);
      const activityRef = printerRef.collection('statusMetadata').doc('current');
      const pendingRef = printerRef.collection('jobs').doc(request.jobId);
      const [delivery, result, activity, pending] = await Promise.all([
        transaction.get(deliveryRef), transaction.get(resultRef), transaction.get(activityRef), transaction.get(pendingRef),
      ]);
      const parsed = deliveredPrintEnvelopeSchema.safeParse(delivery.exists ? delivery.data() : undefined);
      if (!parsed.success || delivery.id !== request.jobId || pending.exists) return invalid();
      const envelope = parsed.data;
      // Read time after native I/O: a slow transaction must not validate an
      // expired envelope using a timestamp captured before authentication.
      const now = Date.now();
      if (!instant.safeParse(now).success || now === 0) return invalid();
      if (envelope.brandId !== identity.brandId || envelope.locationId !== identity.locationId
        || envelope.printerId !== identity.printerId || envelope.job.id !== request.jobId
        || envelope.printerRevision !== identity.printerRevision || envelope.credentialRevision !== identity.credentialRevision
        || envelope.deliveredAt > now) return invalid();
      const binding = { brandId: identity.brandId, locationId: identity.locationId,
        printerId: identity.printerId, jobId: request.jobId };
      const claimDigest = printDeliveryTokenDigest('claim', request.claimToken, binding);
      const deliveryDigest = printDeliveryTokenDigest('delivery', request.confirmation.token, binding);
      if (!equalDigest(envelope.claimDigest, claimDigest) || !equalDigest(envelope.deliveryDigest, deliveryDigest)) return invalid();
      const previous = readStoredPrinterActivity(activity.exists ? activity.data() : undefined, identity, identity.printerRevision, now);
      // Read-only projections allow bounded server clock skew. A writer must
      // still reject a backwards clock instead of persisting an older result.
      if (previous.lastConfirmedPrintAt !== null && previous.lastConfirmedPrintAt > now) {
        throw new NativePrintResultError('print_result_unavailable');
      }
      // A reviewed producer must downgrade never before any possible dispatch.
      if (previous.printHistory === 'never') return invalid();
      if (result.exists) {
        const saved = confirmedPrintResultSchema.safeParse(result.data());
        if (!saved.success || result.id !== request.jobId || saved.data.jobId !== request.jobId
          || saved.data.brandId !== identity.brandId || saved.data.locationId !== identity.locationId
          || saved.data.printerId !== identity.printerId || saved.data.printerRevision !== envelope.printerRevision
          || saved.data.credentialRevision !== envelope.credentialRevision
          || !equalDigest(saved.data.claimDigest, claimDigest) || !equalDigest(saved.data.deliveryDigest, deliveryDigest)
          || !equalDigest(saved.data.contentDigest, envelope.contentDigest)
          || saved.data.confirmedAt < envelope.deliveredAt || saved.data.confirmedAt >= envelope.expiresAt
          || saved.data.confirmedAt > now || previous.printHistory !== 'confirmed'
          || previous.lastConfirmedPrintAt! < saved.data.confirmedAt) return invalid();
        return { outcome: 'confirmed' as const, duplicate: true, confirmedAt: saved.data.confirmedAt };
      }
      if (now >= envelope.expiresAt) return invalid();
      const confirmedAt = now;
      transaction.create(resultRef, { schemaVersion: 1, brandId: identity.brandId, locationId: identity.locationId,
        printerId: identity.printerId, jobId: request.jobId, state: 'confirmed', printerRevision: identity.printerRevision,
        credentialRevision: identity.credentialRevision, claimDigest, deliveryDigest, contentDigest: envelope.contentDigest, confirmedAt });
      // The activity reader rejects backwards clocks/future history. Ties keep
      // the existing stable job identity rather than reordering confirmations.
      if (previous.lastConfirmedPrintAt === null || confirmedAt > previous.lastConfirmedPrintAt) {
        transaction.set(activityRef, { ...previous, printHistory: 'confirmed', lastConfirmedPrintAt: confirmedAt,
          lastConfirmedJobId: request.jobId });
      }
      return { outcome: 'confirmed' as const, duplicate: false, confirmedAt };
    });
  } catch (error) {
    if (error instanceof NativePrintResultError) throw error;
    throw new NativePrintResultError('print_result_unavailable');
  }
}
