import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { brandSlugError } from '../brand-subdomain';
import { createQrStore, QR_PATHS, type QrDatabase, type QrResolvedTarget, type QrTransaction } from './store';
import { normalizeDestination } from './payload';

import { QR_TOUCH_QUERY, QR_TOUCH_WINDOW_MS, QR_TOUCH_RECEIPT_PATTERN } from './touch-contract';
export { QR_TOUCH_QUERY, QR_TOUCH_WINDOW_MS, QR_TOUCH_RECEIPT_PATTERN } from './touch-contract';
const allowedQuery = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_id', 'utm_term', 'utm_content']);
export type QrTouchProof = { schemaVersion: 1; proofHash: string; qrRevision: number; destination: string; expiresAt: number };
export type VerifiedClubQrTouch = { schemaVersion: 1; brandId: string; locationId: string | null; qrId: string;
  qrRevision: number; scanEventId: string; occurredAt: number; expiresAt: number; campaign: string; tags: string[] };

/** Only a directly served native signup route: never a redirector, portal login or external tracker. */
export function isClubQrDestination(destination: string, brandSlug: unknown): boolean {
  if (typeof brandSlug !== 'string' || brandSlugError(brandSlug)) return false;
  try {
    const url = new URL(destination);
    return url.origin === `https://${brandSlug}.orderfly.dk` && !url.username && !url.password &&
      url.pathname === '/club/tilmeld' && !url.hash && [...url.searchParams.keys()].every(key => allowedQuery.has(key));
  } catch { return false; }
}

/** Random proof is created once outside the retryable redirect transaction. Never log or persist it. */
export function newQrTouchProof(): string { return randomBytes(32).toString('hex'); }
export function prepareClubQrTouch(target: QrResolvedTarget, brandSlug: unknown, slug: string, eventId: string, proof: string | null, now: number) {
  if (!proof || !QR_TOUCH_RECEIPT_PATTERN.test(`${slug}.${eventId}.${proof}`) || !Number.isSafeInteger(now) ||
      !Number.isSafeInteger(target.revision) || !isClubQrDestination(target.destination, brandSlug)) return null;
  const receipt = `${slug}.${eventId}.${proof}`;
  const touch: QrTouchProof = { schemaVersion: 1, proofHash: createHash('sha256').update(proof).digest('hex'),
    qrRevision: target.revision, destination: target.destination, expiresAt: now + QR_TOUCH_WINDOW_MS };
  const destination = new URL(target.destination);
  destination.searchParams.set(QR_TOUCH_QUERY, receipt);
  return { destination: destination.href, touch };
}

/**
 * Read phase only; the caller stages its conversion in the SAME business transaction.
 * The envelope is an attribution hint, not identity: copied links never authorize access.
 * Statistics consent must be current at submit. No retrospective reconstruction.
 */
export async function readClubQrTouchInTransaction(db: QrDatabase, tx: QrTransaction, input: {
  receipt: unknown; brandId: string; statisticsConsent: boolean; now: number;
}): Promise<VerifiedClubQrTouch | null> {
  if (input.statisticsConsent !== true || typeof input.receipt !== 'string' ||
      !QR_TOUCH_RECEIPT_PATTERN.test(input.receipt) || !Number.isSafeInteger(input.now) ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(input.brandId)) return null;
  const [slug, eventId, proof] = input.receipt.split('.');
  try {
    // Check the public mapping before resolving, so a foreign receipt cannot cause foreign reads.
    const index = await tx.get(db.collection(QR_PATHS.publicCodes).doc(slug));
    if (!index.exists || index.data()?.brandId !== input.brandId) return null;
    const target = await createQrStore(db, { normalizeDestination, now: () => input.now }).resolveInTransaction(tx, slug);
    if (target.brandId !== input.brandId) return null;
    const brand = await tx.get(db.collection('brands').doc(input.brandId));
    if (!isClubQrDestination(target.destination, brand.data()?.slug)) return null;
    const event = await tx.get(db.collection('brands').doc(input.brandId).collection(QR_PATHS.codes).doc(target.codeId).collection(QR_PATHS.events).doc(eventId));
    const row = event.data(), touch = row?.touch;
    if (!event.exists || !row || !touch || touch.schemaVersion !== 1 || row.brandId !== input.brandId ||
        row.qrId !== target.codeId || row.locationId !== target.locationId || touch.qrRevision !== target.revision ||
        touch.destination !== target.destination || row.classification?.probableScan !== true ||
        !Number.isSafeInteger(row.timestamp) || row.timestamp > input.now ||
        !Number.isSafeInteger(touch.expiresAt) || touch.expiresAt !== row.timestamp + QR_TOUCH_WINDOW_MS ||
        touch.expiresAt <= input.now || typeof touch.proofHash !== 'string' || !/^[a-f0-9]{64}$/.test(touch.proofHash) ||
        typeof row.campaign !== 'string' || !Array.isArray(row.tags) || !row.tags.every((tag: unknown) => typeof tag === 'string')) return null;
    const actual = createHash('sha256').update(proof).digest();
    if (!timingSafeEqual(actual, Buffer.from(touch.proofHash, 'hex'))) return null;
    return { schemaVersion: 1, brandId: input.brandId, locationId: row.locationId, qrId: target.codeId,
      qrRevision: touch.qrRevision, scanEventId: eventId, occurredAt: row.timestamp, expiresAt: touch.expiresAt,
      campaign: row.campaign, tags: [...row.tags] };
  } catch {
    // Optional attribution must never expose internal errors or prevent ordinary signup.
    return null;
  }
}
