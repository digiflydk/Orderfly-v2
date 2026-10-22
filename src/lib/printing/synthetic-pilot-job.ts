import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyCloudPrntHttpDevice, CloudPrntHttpAuthenticationError } from './cloudprnt-http-auth';
import { credentialSchema } from './device-credentials-service';
import { createSyntheticTestBonContent, readSyntheticTestBonContent, PrintJobContentError } from './job-content';
import { pilotQualificationSessionSchema } from './pilot-qualification';

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.number().int().positive().safe().max(8.64e15);
const revision = z.number().int().positive().safe();
const scope = { brandId: id, locationId: id, printerId: id };
const binding = { ...scope, printerRevision: revision, credentialRevision: revision };
const creation = z.object({ ...binding, sessionId: token, model: z.enum(['mc-print2', 'mc-print3']),
  paperWidthMm: z.union([z.literal(58), z.literal(80)]), createdAt: instant, expiresAt: instant }).strict()
  .refine(row => row.expiresAt > row.createdAt && row.expiresAt - row.createdAt <= 600_000);

export const syntheticPilotJobSchema = z.object({ schemaVersion: z.literal(1), purpose: z.literal('synthetic-testbon'),
  ...binding, sessionId: token, jobId: token, model: z.enum(['mc-print2', 'mc-print3']),
  paperWidthMm: z.union([z.literal(58), z.literal(80)]), createdAt: instant, expiresAt: instant,
  content: z.unknown(), state: z.enum(['queued', 'offered', 'download_started', 'confirmed', 'failed', 'unknown']),
  tokenDigest: digest.nullable(), offeredAt: instant.nullable(), downloadStartedAt: instant.nullable(),
  confirmedAt: instant.nullable(), outcome: z.enum(['confirmed', 'failed', 'unknown']).nullable(),
}).strict().refine(row => row.jobId === row.sessionId && row.expiresAt > row.createdAt
  && row.expiresAt - row.createdAt <= 600_000 && (row.model !== 'mc-print2' || row.paperWidthMm === 58)
  && (row.state === 'queued'
    ? row.tokenDigest === null && row.offeredAt === null && row.downloadStartedAt === null && row.confirmedAt === null && row.outcome === null
    : row.tokenDigest !== null && row.offeredAt !== null && row.offeredAt >= row.createdAt && row.offeredAt < row.expiresAt
      && (row.state === 'offered'
        ? row.downloadStartedAt === null && row.confirmedAt === null && row.outcome === null
        : row.downloadStartedAt !== null && row.downloadStartedAt >= row.offeredAt && row.downloadStartedAt < row.expiresAt
          && (row.state === 'download_started' ? row.outcome === null && row.confirmedAt === null
            : row.outcome === row.state && (row.state === 'confirmed'
              ? row.confirmedAt !== null && row.confirmedAt >= row.downloadStartedAt && row.confirmedAt < row.expiresAt
              : row.confirmedAt === null)))));

const consumedSession = pilotQualificationSessionSchema.innerType().extend({ state: z.literal('consumed'),
  jobId: token, contentDigest: digest, consumedAt: instant }).strict()
  .refine(row => row.jobId === row.sessionId && row.expiresAt - row.issuedAt === 600_000
    && row.consumedAt >= row.issuedAt && row.consumedAt < row.expiresAt);
const pointerSchema = z.object({ schemaVersion: z.literal(1), sessionId: token }).strict();
type Job = z.infer<typeof syntheticPilotJobSchema>;
export class SyntheticPilotJobError extends Error {
  constructor(readonly code: 'invalid_pilot_job' | 'pilot_unavailable' | 'pilot_already_downloaded') { super(code); }
}
const invalid = (): never => { throw new SyntheticPilotJobError('invalid_pilot_job'); };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const same = (a: string, b: string) => timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));

/** Pure canonical data builder, never permission. Only the authenticated session
 * consumer may persist this row atomically with consumed session/current pointer.
 */
export function createSyntheticPilotJobRecord(input: unknown) {
  const parsed = creation.safeParse(input);
  if (!parsed.success) return invalid();
  const c = parsed.data;
  const content = createSyntheticTestBonContent({ brandId: c.brandId, locationId: c.locationId,
    printerId: c.printerId, printerRevision: c.printerRevision, model: c.model, paperWidthMm: c.paperWidthMm });
  const record = syntheticPilotJobSchema.parse({ schemaVersion: 1, purpose: 'synthetic-testbon', ...c,
    jobId: c.sessionId, content, state: 'queued', tokenDigest: null, offeredAt: null,
    downloadStartedAt: null, confirmedAt: null, outcome: null });
  return { ...record, content };
}

function request(input: unknown, operation: 'poll' | 'download' | 'result') {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) return invalid();
    const fields = ['brandId', 'locationId', 'printerId', 'authorization', ...(operation === 'poll' ? ['ready'] : ['token']),
      ...(operation === 'result' ? ['outcome'] : [])];
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || !fields.includes(key))) return invalid();
    const copy: Record<string, unknown> = {};
    for (const key of fields) {
      const d = Object.getOwnPropertyDescriptor(input, key);
      if (!d || !('value' in d)) return invalid();
      if (key === 'ready' ? typeof d.value !== 'boolean'
        : typeof d.value !== 'string' || d.value.length > (key === 'authorization' ? 256 : 128)) return invalid();
      copy[key] = d.value;
    }
    const parsed = z.object({ ...scope, authorization: z.string().min(1).max(256), ready: z.boolean().optional(), token: token.optional(),
      outcome: z.enum(['confirmed', 'failed', 'unknown']).optional() }).strict().safeParse(copy);
    if (!parsed.success) return invalid();
    return parsed.data;
  } catch { return invalid(); }
}

/** Fixed one-job pilot only. This is not the order queue or production capability.
 * State commits before token/bytes leave the service. A second download is denied,
 * including after lost response, rather than risking an automatic duplicate print.
 */
async function operate(input: unknown, operation: 'poll' | 'download' | 'result') {
  const c = request(input, operation);
  if (process.env.ORDERFLY_PRINTER_PILOT_OUTPUT_ENABLED !== 'true'
    || process.env.ORDERFLY_PRINTER_CONFIG_WRITES_ENABLED !== 'true') throw new SyntheticPilotJobError('pilot_unavailable');
  try {
    const db = getAdminDb();
    return await db.runTransaction(async tx => {
      const identity = await verifyCloudPrntHttpDevice({ db, transaction: tx }, {
        brandId: c.brandId, locationId: c.locationId, printerId: c.printerId, authorization: c.authorization });
      if (identity.printerState !== 'active') return invalid();
      // Device status may only withhold work. It never grants identity/output authority.
      if (operation === 'poll' && c.ready !== true) return { jobReady: false as const };
      const printer = db.collection('locations').doc(c.locationId).collection('printers').doc(c.printerId);
      const pointer = await tx.get(printer.collection('pilotState').doc('current'));
      if (!pointer.exists && operation === 'poll') return { jobReady: false as const };
      const p = pointerSchema.safeParse(pointer.data());
      if (!p.success) return invalid();
      const jobRef = printer.collection('pilotJobs').doc(p.data.sessionId);
      const [saved, session, credential] = await Promise.all([tx.get(jobRef),
        tx.get(printer.collection('pilotQualifications').doc(p.data.sessionId)), tx.get(printer.collection('deviceCredentials').doc('current'))]);
      const job = syntheticPilotJobSchema.safeParse(saved.data()), qualification = consumedSession.safeParse(session.data());
      const currentCredential = credentialSchema.safeParse(credential.data()), now = Date.now();
      if (!saved.exists || !session.exists || !job.success || !qualification.success || !instant.safeParse(now).success) return invalid();
      const j = job.data, q = qualification.data;
      if (!credential.exists || !currentCredential.success || currentCredential.data.revokedAt !== null
        || currentCredential.data.issuedAt > now || Object.keys(binding).some(key =>
          currentCredential.data[key as keyof typeof binding] !== identity[key as keyof typeof binding])) return invalid();
      if (saved.id !== j.jobId || session.id !== j.sessionId || p.data.sessionId !== j.sessionId
        || Object.keys(binding).some(key => j[key as keyof typeof binding] !== identity[key as keyof typeof binding]
          || q[key as keyof typeof binding] !== identity[key as keyof typeof binding])
        || j.expiresAt !== q.expiresAt || j.createdAt !== q.consumedAt || now < j.createdAt
        || [j.offeredAt, j.downloadStartedAt, j.confirmedAt].some(time => time !== null && time > now)) return invalid();
      const content = readSyntheticTestBonContent(j.content, { brandId: identity.brandId, locationId: identity.locationId,
        printerId: identity.printerId, printerRevision: identity.printerRevision, model: j.model, paperWidthMm: j.paperWidthMm });
      if (q.contentDigest !== content.sha256) return invalid();
      // Reconstructible only with this current authenticated private credential;
      // no plaintext token or device secret is stored in any native record.
      const deliveryToken = createHmac('sha256', currentCredential.data.secretDigest).update(JSON.stringify(['orderfly-synthetic-pilot-v1',
        j.brandId, j.locationId, j.printerId, j.printerRevision, j.credentialRevision, j.jobId, content.sha256])).digest('base64url');
      const tokenDigest = hash(deliveryToken);
      if (j.state !== 'queued' && !same(j.tokenDigest!, tokenDigest)) return invalid();
      // A terminal pointer deliberately remains reserved. Authenticated ready
      // polls may learn only that no work remains, even after expiry, but only
      // after the entire current private binding and canonical content validate.
      // Expiry still closes every nonterminal poll and every data/result action.
      if (operation === 'poll' && ['confirmed', 'failed', 'unknown'].includes(j.state)) return { jobReady: false as const };
      if (now >= j.expiresAt) return invalid();
      if (operation === 'poll') {
        if (!['queued', 'offered'].includes(j.state)) return { jobReady: false as const };
        if (j.state === 'queued') tx.set(jobRef, { ...j, state: 'offered', tokenDigest, offeredAt: now });
        return { jobReady: true as const, mediaTypes: ['image/png'], jobToken: deliveryToken };
      }
      if (!c.token || !same(hash(c.token), tokenDigest)) return invalid();
      if (operation === 'download') {
        if (j.state !== 'offered') throw new SyntheticPilotJobError('pilot_already_downloaded');
        tx.set(jobRef, { ...j, state: 'download_started', downloadStartedAt: now });
        return { contentType: 'image/png', payload: content.payload, sha256: content.sha256 };
      }
      if (j.state !== 'download_started') {
        if (j.outcome !== c.outcome) return invalid();
        return { outcome: j.outcome!, duplicate: true as const, physicalCompatibilityVerified: false as const };
      }
      if (!c.outcome) return invalid();
      const completed: Job = { ...j, state: c.outcome, outcome: c.outcome, confirmedAt: c.outcome === 'confirmed' ? now : null };
      tx.set(jobRef, completed);
      return { outcome: c.outcome, duplicate: false as const, physicalCompatibilityVerified: false as const };
    });
  } catch (error) {
    if (error instanceof SyntheticPilotJobError || error instanceof CloudPrntHttpAuthenticationError) throw error;
    if (error instanceof PrintJobContentError) return invalid();
    throw new SyntheticPilotJobError('pilot_unavailable');
  }
}

export const pollSyntheticPilotJob = (input: unknown) => operate(input, 'poll');
export const downloadSyntheticPilotJob = (input: unknown) => operate(input, 'download');
/** Trusted HTTP adapter must derive outcome from actual strict CloudPRNT status;
 * never accept a JSON caller boolean as a physical-success assertion.
 */
export const recordSyntheticPilotResult = (input: unknown) => operate(input, 'result');
