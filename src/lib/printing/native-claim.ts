import 'server-only';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import type { NativeTransactionContext } from '@/lib/server/firestore-compat';
import { verifyNativePrinterDevice } from './device-auth-native';
import { printJobId } from './domain';
import { storedQueuedPrintJobSchema } from './queue-storage';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.number().int().positive().safe().max(8.64e15);
const revision = z.number().int().positive().safe();
const scope = { brandId: id, locationId: id, printerId: id };
const requestSchema = z.object({ ...scope, jobId: digest, secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const canonicalJob = storedQueuedPrintJobSchema.omit({ updatedAt: true });

export const nativePrintClaimSchema = z.object({
  schemaVersion: z.literal(1), ...scope, jobId: digest, state: z.literal('reserved'),
  job: canonicalJob, printerRevision: revision, credentialRevision: revision,
  attemptNumber: z.literal(1), claimDigest: digest, deliveryDigest: digest,
  reservedAt: instant, expiresAt: instant,
}).strict().refine(row => row.expiresAt - row.reservedAt === 60_000
  && row.job.createdAt > 0 && row.job.createdAt <= row.reservedAt
  && row.job.id === row.jobId && printJobId(row.job) === row.jobId
  && row.job.brandId === row.brandId && row.job.locationId === row.locationId
  && row.job.printerId === row.printerId && row.job.printerRevision === row.printerRevision);

export class NativePrintClaimError extends Error {
  constructor(readonly code: 'invalid_claim' | 'claims_unavailable') { super(code); }
}
const reject = (): never => { throw new NativePrintClaimError('invalid_claim'); };
const unavailable = (): never => { throw new NativePrintClaimError('claims_unavailable'); };
declare const attemptBrand: unique symbol;
export type NativePrintClaimAttempt = Readonly<{ [attemptBrand]: true }>;
type Request = z.infer<typeof requestSchema>;
const attempts = new WeakMap<object, { request: Request; claimToken: string; deliveryToken: string }>();
const scopedDigest = (kind: 'claim' | 'delivery', token: string, request: Request) => createHash('sha256')
  .update(JSON.stringify(['orderfly-delivery-v1', kind, request.brandId, request.locationId,
    request.printerId, request.jobId, token])).digest('hex');
const sameDigest = (a: string, b: string) => timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

/** Server-memory retry identity, NOT authentication, reservation or dispatch proof.
 * Construct ONCE outside the caller's runTransaction callback, reuse on SDK retry.
 */
export function createNativePrintClaimAttempt(input: unknown): NativePrintClaimAttempt {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return reject();
    const keys = Reflect.ownKeys(input), allowed = ['brandId', 'locationId', 'printerId', 'jobId', 'secret'];
    if (keys.length !== allowed.length || keys.some(key => typeof key !== 'string' || !allowed.includes(key))) return reject();
    const copy: Record<string, string> = {};
    for (const key of allowed) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string'
        || descriptor.value.length > 128) return reject();
      copy[key] = descriptor.value;
    }
    const parsed = requestSchema.safeParse(copy);
    if (!parsed.success) return reject();
    const handle = Object.freeze({}) as NativePrintClaimAttempt;
    attempts.set(handle, { request: parsed.data, claimToken: randomBytes(32).toString('base64url'),
      deliveryToken: randomBytes(32).toString('base64url') });
    return handle;
  } catch { return reject(); }
}

/** Internal reservation ONLY. Queued job/ledger/activity are deliberately unchanged.
 * Missing transport capability/output policy means no dispatch grant is issued.
 * Returned snapshot is NOT commit proof and must never be used to deliver a job.
 */
export async function reserveNativePrintClaim(context: NativeTransactionContext, attempt: NativePrintClaimAttempt) {
  if (process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') return unavailable();
  try {
    const storedAttempt = attempts.get(attempt);
    if (!storedAttempt || !context || context.db !== getAdminDb()
      || !context.transaction || typeof context.transaction.get !== 'function') return reject();
    const { request } = storedAttempt;
    const identity = await verifyNativePrinterDevice(context, { brandId: request.brandId,
      locationId: request.locationId, printerId: request.printerId, secret: request.secret });
    if (identity.printerState !== 'active') return reject();
    const printer = context.db.collection('locations').doc(request.locationId).collection('printers').doc(request.printerId);
    const claimRef = printer.collection('claims').doc(request.jobId);
    const [jobSnapshot, claimSnapshot] = await Promise.all([
      context.transaction.get(printer.collection('jobs').doc(request.jobId)), context.transaction.get(claimRef),
    ]);
    const parsedJob = storedQueuedPrintJobSchema.safeParse(jobSnapshot.exists ? jobSnapshot.data() : undefined);
    const now = Date.now();
    if (!instant.safeParse(now).success || now > 8.64e15 - 60_000 || !parsedJob.success
      || jobSnapshot.id !== request.jobId || printJobId(parsedJob.data) !== request.jobId) return reject();
    const job = parsedJob.data;
    if (job.brandId !== identity.brandId || job.locationId !== identity.locationId || job.printerId !== identity.printerId
      || job.printerRevision !== identity.printerRevision || job.createdAt <= 0 || job.createdAt > now) return reject();
    const { updatedAt: _updatedAt, ...canonical } = job;
    const boundJob = canonicalJob.parse(canonical);
    const claimDigest = scopedDigest('claim', storedAttempt.claimToken, request);
    const deliveryDigest = scopedDigest('delivery', storedAttempt.deliveryToken, request);
    let expiresAt: number;
    if (claimSnapshot.exists) {
      const claim = nativePrintClaimSchema.safeParse(claimSnapshot.data());
      if (!claim.success || claimSnapshot.id !== request.jobId || claim.data.jobId !== request.jobId
        || claim.data.brandId !== identity.brandId || claim.data.locationId !== identity.locationId
        || claim.data.printerId !== identity.printerId || claim.data.printerRevision !== identity.printerRevision
        || claim.data.credentialRevision !== identity.credentialRevision
        || JSON.stringify(claim.data.job) !== JSON.stringify(boundJob)
        || claim.data.reservedAt > now || claim.data.expiresAt <= now
        || !sameDigest(claim.data.claimDigest, claimDigest) || !sameDigest(claim.data.deliveryDigest, deliveryDigest)) return reject();
      expiresAt = claim.data.expiresAt;
    } else {
      expiresAt = now + 60_000;
      context.transaction.create(claimRef, { schemaVersion: 1, brandId: identity.brandId, locationId: identity.locationId,
        printerId: identity.printerId, jobId: request.jobId, state: 'reserved', job: boundJob,
        printerRevision: identity.printerRevision, credentialRevision: identity.credentialRevision,
        attemptNumber: 1, claimDigest, deliveryDigest, reservedAt: now, expiresAt });
    }
    return Object.freeze({ brandId: identity.brandId, locationId: identity.locationId, printerId: identity.printerId,
      jobId: request.jobId, printerRevision: identity.printerRevision, credentialRevision: identity.credentialRevision,
      attemptNumber: 1 as const, expiresAt, dispatchAuthorized: false as const });
  } catch (error) {
    if (error instanceof NativePrintClaimError) throw error;
    throw new NativePrintClaimError('claims_unavailable');
  }
}
