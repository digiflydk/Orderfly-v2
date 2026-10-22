import type { QrRequestClassification } from './metrics';

/** Permanent per-code counters, with no visitor identifiers or raw request fields. */
export type QrLifetime = {
  openings: number; probableScans: number; excludedOpenings: number;
  firstOpenedAt: number | null; lastOpenedAt: number | null;
};
export class QrLifetimeError extends Error {
  constructor(public code: 'invalid_lifetime' | 'invalid_classification' | 'invalid_time' | 'counter_overflow') { super(code); }
}
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)
  && value >= 0 && Number.isFinite(new Date(value).getTime());
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function emptyQrLifetime(): QrLifetime {
  return { openings: 0, probableScans: 0, excludedOpenings: 0, firstOpenedAt: null, lastOpenedAt: null };
}

/** Missing legacy values initialize to zero; a present malformed value must never silently reset counts. */
export function readQrLifetime(previous: unknown): QrLifetime {
  if (previous === null || previous === undefined) return emptyQrLifetime();
  if (typeof previous !== 'object' || Array.isArray(previous)) throw new QrLifetimeError('invalid_lifetime');
  const value = previous as Record<string, unknown>;
  const { openings, probableScans, excludedOpenings, firstOpenedAt, lastOpenedAt } = value;
  if (!count(openings) || !count(probableScans) || !count(excludedOpenings)
    || !Number.isSafeInteger(probableScans + excludedOpenings) || openings !== probableScans + excludedOpenings
    || (openings === 0 ? firstOpenedAt !== null || lastOpenedAt !== null
      : !timestamp(firstOpenedAt) || !timestamp(lastOpenedAt) || firstOpenedAt > lastOpenedAt)) throw new QrLifetimeError('invalid_lifetime');
  // Construct an exact projection: unrelated fields, including identity, are never copied.
  return { openings, probableScans, excludedOpenings, firstOpenedAt: firstOpenedAt as number | null, lastOpenedAt: lastOpenedAt as number | null };
}

/** Call inside the same transaction as event/limiter writes. This helper performs no I/O. */
export function incrementQrLifetime(previous: unknown, classification: QrRequestClassification, at: number): QrLifetime {
  const value = readQrLifetime(previous);
  if (!timestamp(at)) throw new QrLifetimeError('invalid_time');
  if (!classification || typeof classification !== 'object' || typeof classification.opening !== 'boolean'
    || typeof classification.probableScan !== 'boolean') throw new QrLifetimeError('invalid_classification');
  const { opening, probableScan, exclusion } = classification;
  const consistent = exclusion === 'none' ? opening && probableScan
    : exclusion === 'head' || exclusion === 'method' ? !opening && !probableScan
      : ['prefetch', 'bot', 'unknown-agent'].includes(exclusion) && opening && !probableScan;
  if (!consistent) throw new QrLifetimeError('invalid_classification');
  if (!opening) return value;
  if (value.openings === Number.MAX_SAFE_INTEGER) throw new QrLifetimeError('counter_overflow');
  return {
    openings: value.openings + 1,
    probableScans: value.probableScans + (probableScan ? 1 : 0),
    excludedOpenings: value.excludedOpenings + (probableScan ? 0 : 1),
    // Request timestamps can commit out of order. Do not reject a valid delayed scan.
    firstOpenedAt: value.firstOpenedAt === null ? at : Math.min(value.firstOpenedAt, at),
    lastOpenedAt: value.lastOpenedAt === null ? at : Math.max(value.lastOpenedAt, at),
  };
}
