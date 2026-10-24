import { z } from 'zod';

/** Pure protocol subset only: no authentication, queue selection, persistence or I/O. */
export const CLOUDPRNT_MAX_POLL_BYTES = 8192;
export const CLOUDPRNT_MAX_QUERY_BYTES = 2048;
/** Firmware may append a cache-busting timestamp. It grants no identity or job authority. */
export function validCloudPrntPollQuery(query: string): boolean {
  return query === '' || /^\?t=[0-9]{1,13}$/.test(query);
}
const token = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const mac = z.string().regex(/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/).transform(s => s.toLowerCase());
const text = z.string().min(1).max(128).regex(/^[\x20-\x7e]+$/);
const pollSchema = z.object({
  statusCode: z.string().min(3).max(384),
  status: z.string().max(128).regex(/^[0-9a-fA-F ]*$/).nullish(),
  printerMAC: mac.nullish(), uniqueID: text.nullish(),
  printingInProgress: z.boolean().nullish(), jobToken: token.nullish(),
}); // Ignore peripherals/extensions; never copy their raw payload into a result/log.

export class CloudPrntProtocolError extends Error {
  constructor(readonly code: 'invalid_poll' | 'invalid_query' | 'invalid_job') { super(code); }
}
export type CloudPrntStatus = { code: number; kind: 'online' | 'busy' | 'reported_error' | 'unknown' };

function parseStatus(value: string, urlEncoded: boolean): CloudPrntStatus | null {
  let decoded: string;
  try { decoded = urlEncoded ? decodeURIComponent(value) : value; } catch { return null; }
  const match = /^([1-9][0-9]{2,3})(?: [\x20-\x7e]{1,96})?$/.exec(decoded);
  if (!match) return null;
  const code = Number(match[1]);
  return { code, kind: code >= 220 && code <= 229 ? 'busy'
    : /^2[0-9]{2}$/.test(match[1]) ? 'online'
    : /^(?:[45][0-9]{2}|1[0-9]{3})$/.test(match[1]) ? 'reported_error' : 'unknown' };
}

/** All poll fields except statusCode can be missing/null per the Star specification. */
export function parseCloudPrntPoll(body: string, contentType: string) {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType)
    || Buffer.byteLength(body, 'utf8') > CLOUDPRNT_MAX_POLL_BYTES) throw new CloudPrntProtocolError('invalid_poll');
  let value: unknown;
  try { value = JSON.parse(body); } catch { throw new CloudPrntProtocolError('invalid_poll'); }
  const parsed = pollSchema.safeParse(value);
  const status = parsed.success ? parseStatus(parsed.data.statusCode, true) : null;
  if (!parsed.success || !status) throw new CloudPrntProtocolError('invalid_poll');
  return { status, printerMAC: parsed.data.printerMAC ?? null, uniqueID: parsed.data.uniqueID ?? null,
    printingInProgress: parsed.data.printingInProgress ?? null, jobToken: parsed.data.jobToken ?? null };
}
export type CloudPrntPoll = ReturnType<typeof parseCloudPrntPoll>;
export const cloudPrntMediaTypes = ['image/png', 'text/plain'] as const;
export type CloudPrntMediaType = typeof cloudPrntMediaTypes[number];
const jobSchema = z.object({ jobToken: token, mediaTypes: z.array(z.enum(cloudPrntMediaTypes)).min(1).max(2) }).strict();

/** Caller must authorize/claim a job separately. This function only formats a response. */
export function cloudPrntPollResponse(poll: CloudPrntPoll, job: unknown = null) {
  if (job === null) return { jobReady: false as const };
  const parsed = jobSchema.safeParse(job);
  if (!parsed.success || new Set(parsed.data.mediaTypes).size !== parsed.data.mediaTypes.length) {
    throw new CloudPrntProtocolError('invalid_job');
  }
  // Missing progress is not a completion signal. A token means there may be an active job.
  if (poll.status.kind !== 'online' || poll.printingInProgress === true || poll.jobToken !== null) {
    return { jobReady: false as const };
  }
  return { jobReady: true as const, mediaTypes: parsed.data.mediaTypes,
    jobToken: parsed.data.jobToken, deleteMethod: 'DELETE' as const };
}

function queryObject(query: string, allowed: readonly string[]) {
  if (Buffer.byteLength(query, 'utf8') > CLOUDPRNT_MAX_QUERY_BYTES || /%(?![0-9a-fA-F]{2})/.test(query)) {
    throw new CloudPrntProtocolError('invalid_query');
  }
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const value: Record<string, string> = {};
  for (const [key, val] of params) {
    if (!allowed.includes(key) || Object.hasOwn(value, key)) throw new CloudPrntProtocolError('invalid_query');
    value[key] = val;
  }
  return value;
}
const identitySchema = z.object({ mac, uid: text.optional(), token }).strict();

/** Token-capable device subset (mC-Print2/3 firmware >=3.2), not legacy tokenless routing. */
export function parseCloudPrntJobQuery(query: string) {
  const value = queryObject(query, ['mac', 'uid', 'token', 'type']);
  const { type, ...identity } = value;
  const parsed = identitySchema.safeParse(identity);
  const mediaType = type === undefined ? null : z.enum(cloudPrntMediaTypes).safeParse(type);
  if (!parsed.success || (mediaType !== null && !mediaType.success)) throw new CloudPrntProtocolError('invalid_query');
  return { ...parsed.data, mediaType: mediaType === null ? null : mediaType.data };
}

export function parseCloudPrntConfirmation(query: string) {
  const value = queryObject(query, ['mac', 'uid', 'token', 'code', 'retry']);
  const { code, retry, ...identity } = value;
  const parsed = identitySchema.safeParse(identity);
  // DELETE success is documented both as "200 OK" and "OK"; normalize only those aliases.
  const status = typeof code === 'string' ? parseStatus(code === 'OK' ? '200 OK' : code, false) : null;
  if (!parsed.success || !status || (retry !== undefined && !/^(0|[1-9][0-9]{0,3})$/.test(retry))) {
    throw new CloudPrntProtocolError('invalid_query');
  }
  return { ...parsed.data, status, retry: retry === undefined ? 0 : Number(retry),
    outcome: status.code === 200 ? 'confirmed' as const
      : status.kind === 'reported_error' ? 'reported_failure' as const : 'uncertain' as const };
}
