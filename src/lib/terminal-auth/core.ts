import 'server-only';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { AuthorityError } from '@/lib/access/authority';
import { requireOrderflyAccess } from '@/lib/access/orderfly-session';
import { authorizeTransaction } from '@/lib/access/scoped-data';

export const TERMINAL_COOKIE = '__Host-orderfly_terminal';
export const TERMINAL_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;
export type TerminalSession = Readonly<{
  sessionId: string; brandId: string; locationId: string; credentialRevision: number;
  actorId: string; brandName: string; locationName: string;
}>;
export type TerminalLoginConfig = { configured: boolean; enabled: boolean; username: string; revision: number; canEdit: boolean };
export class TerminalAuthError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
const minted = new WeakSet<object>();
const key = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{3,64}$/);
const passwordSchema = z.string().min(12).max(128);
const hex = z.string().regex(/^[a-f0-9]{64}$/);
const credentialSchema = z.object({
  schemaVersion: z.literal(1), brandId: key, locationId: key, username: usernameSchema,
  salt: z.string().regex(/^[a-f0-9]{32}$/), passwordHash: z.string().regex(/^[a-f0-9]{128}$/),
  enabled: z.boolean(), revision: z.number().int().positive().safe(), updatedAt: z.number().finite(),
}).strict();
const sessionSchema = z.object({
  schemaVersion: z.literal(1), brandId: key, locationId: key, credentialRevision: z.number().int().positive().safe(),
  createdAt: z.number().finite(), revokedAt: z.number().finite().nullable(),
}).strict();
const claimSchema = z.object({ schemaVersion: z.literal(1), locationId: key }).strict();
const settingsSchema = z.object({ username: usernameSchema, enabled: z.boolean(), password: passwordSchema.optional(), expectedRevision: z.number().int().min(0).safe() }).strict();
const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) }).strict();
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const unauthorized = (): never => { throw new AuthorityError('unauthorized', 401); };
const conflict = (): never => { throw new TerminalAuthError('terminal_auth_conflict', 409); };
const invalid = (): never => { throw new TerminalAuthError('terminal_auth_invalid', 400); };
const unavailable = (): never => { throw new AuthorityError('terminal_auth_unavailable', 503); };
const label = (value: unknown): string => typeof value === 'string' ? value : '';
function active(data: FirebaseFirestore.DocumentData | undefined) {
  return !!data && data.deleted !== true && data.isDeleted !== true && data.deletedAt == null && data.isActive !== false && data.isTestData !== true;
}
async function native(tx: FirebaseFirestore.Transaction, brandId: string, locationId: string) {
  const db = getAdminDb();
  const [brand, location] = await Promise.all([tx.get(db.collection('brands').doc(brandId)), tx.get(db.collection('locations').doc(locationId))]);
  const b = brand.data(), l = location.data();
  if (!brand.exists || !location.exists || !active(b) || !active(l) || !['active', 'trialing'].includes(b!.status) || l!.brandId !== brandId) return unauthorized();
  return { brandName: label(b!.name), locationName: label(l!.name) };
}
async function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, value) => error ? reject(error) : resolve(value)));
}
function mint(sessionId: string, value: z.infer<typeof sessionSchema>, names: { brandName: string; locationName: string }): TerminalSession {
  const session = Object.freeze({ sessionId, brandId: value.brandId, locationId: value.locationId,
    credentialRevision: value.credentialRevision, actorId: hash(`terminal-actor:${sessionId}`), ...names });
  minted.add(session); return session;
}
async function validate(tx: FirebaseFirestore.Transaction, sessionId: string) {
  const db = getAdminDb(), row = await tx.get(db.collection('terminalSessions').doc(sessionId));
  const parsed = sessionSchema.safeParse(row.data());
  if (!parsed.success || parsed.data.revokedAt !== null) return unauthorized();
  const s = parsed.data, credentials = credentialSchema.safeParse((await tx.get(db.collection('terminalCredentials').doc(s.locationId))).data());
  if (!credentials.success || !credentials.data.enabled || credentials.data.revision !== s.credentialRevision
    || credentials.data.brandId !== s.brandId || credentials.data.locationId !== s.locationId) return unauthorized();
  const names = await native(tx, s.brandId, s.locationId);
  return { stored: s, names };
}
/** Null means absent cookie only. Invalid and revoked cookies never fall back to admin. */
export async function getTerminalSession(): Promise<TerminalSession | null> {
  const token = (await cookies()).get(TERMINAL_COOKIE)?.value;
  if (token === undefined) return null;
  if (!hex.safeParse(token).success) return unauthorized();
  const sessionId = hash(token);
  try {
    return await getAdminDb().runTransaction(async tx => {
      const checked = await validate(tx, sessionId); return mint(sessionId, checked.stored, checked.names);
    }, { readOnly: true });
  } catch (error) { if (error instanceof AuthorityError) throw error; return unavailable(); }
}
/** Call inside every business mutation transaction, using the exact minted object. */
export async function authorizeTerminalTransaction(tx: FirebaseFirestore.Transaction, session: TerminalSession, brandId: string, locationId: string): Promise<void> {
  if (!minted.has(session) || session.brandId !== brandId || session.locationId !== locationId) return unauthorized();
  const checked = await validate(tx, session.sessionId);
  if (checked.stored.brandId !== brandId || checked.stored.locationId !== locationId || checked.stored.credentialRevision !== session.credentialRevision) return unauthorized();
}
export function publicTerminalSession(session: TerminalSession) {
  return { authenticated: true as const, brandId: session.brandId, brandName: session.brandName, locationId: session.locationId, locationName: session.locationName };
}

export const TERMINAL_LOGIN_LIMIT = 12;
export const TERMINAL_LOGIN_WINDOW_MS = 15 * 60 * 1000;
/** Known logins have isolated durable buckets. Unknown names share64 fixed
 * buckets, bounding junk-document creation without locking unrelated brands. */
async function consumeAttempt(username: string) {
  const db = getAdminDb(), usernameHash = hash(username), claimRef = db.collection('terminalUsernames').doc(usernameHash);
  return db.runTransaction(async tx => {
    const claim = claimSchema.safeParse((await tx.get(claimRef)).data());
    const bucket = claim.success ? `login-${usernameHash}` : `unknown-${parseInt(usernameHash.slice(0, 4), 16) % 64}`;
    const ref = db.collection('terminalLoginThrottle').doc(bucket), row = (await tx.get(ref)).data(), now = Date.now();
    const reset = typeof row?.windowStartedAt !== 'number' || !Number.isFinite(row.windowStartedAt) || now - row.windowStartedAt >= TERMINAL_LOGIN_WINDOW_MS;
    const attempts = reset ? 0 : typeof row?.attempts === 'number' && Number.isSafeInteger(row.attempts) && row.attempts >= 0 ? row.attempts : TERMINAL_LOGIN_LIMIT;
    if (attempts >= TERMINAL_LOGIN_LIMIT) throw new TerminalAuthError('terminal_auth_throttled', 429);
    tx.set(ref, { schemaVersion: 1, windowStartedAt: reset ? now : row!.windowStartedAt, attempts: attempts + 1 });
    return claim.success ? claim.data.locationId : null;
  });
}
export async function loginTerminal(input: unknown): Promise<{ token: string; session: TerminalSession }> {
  const parsed = loginSchema.safeParse(input); if (!parsed.success) return invalid();
  const { username, password } = parsed.data, db = getAdminDb();
  try {
    const locationId = await consumeAttempt(username);
    const raw = locationId ? await db.collection('terminalCredentials').doc(locationId).get() : null;
    const stored = credentialSchema.safeParse(raw?.data());
    // Unknown/disabled usernames pay the same password hashing cost; no raw values logged.
    const computed = await derive(password, stored.success ? stored.data.salt : '00'.repeat(16));
    const expected = Buffer.from(stored.success ? stored.data.passwordHash : '00'.repeat(64), 'hex');
    const matched = timingSafeEqual(computed, expected);
    if (!stored.success || !matched || !stored.data.enabled || stored.data.username !== username || stored.data.locationId !== locationId) return unauthorized();
    const c = stored.data, token = randomBytes(32).toString('hex'), sessionId = hash(token);
    const priorToken = (await cookies()).get(TERMINAL_COOKIE)?.value;
    const priorId = priorToken && hex.safeParse(priorToken).success ? hash(priorToken) : null;
    const session = await db.runTransaction(async tx => {
      const [currentRow, claimRow, priorRow] = await Promise.all([
        tx.get(db.collection('terminalCredentials').doc(c.locationId)), tx.get(db.collection('terminalUsernames').doc(hash(username))),
        priorId ? tx.get(db.collection('terminalSessions').doc(priorId)) : Promise.resolve(null),
      ]);
      const current = credentialSchema.safeParse(currentRow.data()), claim = claimSchema.safeParse(claimRow.data());
      if (!current.success || !claim.success || claim.data.locationId !== c.locationId || !current.data.enabled
        || current.data.username !== username || current.data.revision !== c.revision || current.data.passwordHash !== c.passwordHash
        || current.data.salt !== c.salt || current.data.brandId !== c.brandId || current.data.locationId !== c.locationId) return unauthorized();
      const names = await native(tx, c.brandId, c.locationId);
      const value = { schemaVersion: 1 as const, brandId: c.brandId, locationId: c.locationId, credentialRevision: c.revision, createdAt: Date.now(), revokedAt: null };
      tx.create(db.collection('terminalSessions').doc(sessionId), value);
      if (priorId && priorRow?.exists) tx.update(db.collection('terminalSessions').doc(priorId), { revokedAt: Date.now() });
      return mint(sessionId, value, names);
    });
    return { token, session };
  } catch (error) { if (error instanceof AuthorityError || error instanceof TerminalAuthError) throw error; return unavailable(); }
}
/** Idempotent revocation also succeeds for missing, invalid or already revoked cookie. */
export async function logoutTerminal(): Promise<void> {
  const token = (await cookies()).get(TERMINAL_COOKIE)?.value;
  if (!token || !hex.safeParse(token).success) return;
  const ref = getAdminDb().collection('terminalSessions').doc(hash(token));
  try { await getAdminDb().runTransaction(async tx => { const row = await tx.get(ref); if (row.exists && row.data()?.revokedAt === null) tx.update(ref, { revokedAt: Date.now() }); }); }
  catch { return unavailable(); }
}
async function configScope(locationId: string, permission: 'orderfly.catalog:view' | 'orderfly.catalog:edit') {
  if (!key.safeParse(locationId).success) return invalid();
  const row = await getAdminDb().collection('locations').doc(locationId).get(), data = row.data();
  if (!row.exists || !key.safeParse(data?.brandId).success) throw new AuthorityError('forbidden');
  const access = await requireOrderflyAccess(data!.brandId, [locationId], permission);
  return { brandId: data!.brandId as string, locationId, identity: access.identity };
}
function metadata(c: z.infer<typeof credentialSchema> | null, canEdit: boolean): TerminalLoginConfig {
  return { configured: c !== null, enabled: c?.enabled ?? false, username: c?.username ?? '', revision: c?.revision ?? 0, canEdit };
}
export async function readTerminalLoginConfig(locationId: string): Promise<TerminalLoginConfig> {
  const scope = await configScope(locationId, 'orderfly.catalog:view');
  let canEdit = false;
  try { await requireOrderflyAccess(scope.brandId, [locationId], 'orderfly.catalog:edit'); canEdit = true; }
  catch (error) { if (!(error instanceof AuthorityError && error.status === 403)) throw error; }
  return getAdminDb().runTransaction(async tx => {
    await authorizeTransaction(tx, scope.identity, scope, 'orderfly.catalog:view', 'location');
    await native(tx, scope.brandId, locationId);
    const row = await tx.get(getAdminDb().collection('terminalCredentials').doc(locationId));
    if (!row.exists) return metadata(null, canEdit);
    const parsed = credentialSchema.safeParse(row.data());
    if (!parsed.success || parsed.data.brandId !== scope.brandId || parsed.data.locationId !== locationId) return unavailable();
    return metadata(parsed.data, canEdit);
  }, { readOnly: true });
}
export async function updateTerminalLoginConfig(locationId: string, input: unknown): Promise<TerminalLoginConfig> {
  const parsed = settingsSchema.safeParse(input); if (!parsed.success) return invalid();
  const data = parsed.data, scope = await configScope(locationId, 'orderfly.catalog:edit'), db = getAdminDb();
  const replacement = data.password ? { salt: randomBytes(16).toString('hex'), passwordHash: '' } : null;
  if (replacement) replacement.passwordHash = (await derive(data.password!, replacement.salt)).toString('hex');
  return db.runTransaction(async tx => {
    await authorizeTransaction(tx, scope.identity, scope, 'orderfly.catalog:edit', 'location');
    await native(tx, scope.brandId, locationId);
    const ref = db.collection('terminalCredentials').doc(locationId), row = await tx.get(ref);
    const before = row.exists ? credentialSchema.safeParse(row.data()) : null;
    if (before && (!before.success || before.data.brandId !== scope.brandId || before.data.locationId !== locationId)) return conflict();
    const saved = before?.success ? before.data : null;
    if ((saved?.revision ?? 0) !== data.expectedRevision) return conflict();
    if (!saved && !replacement) return invalid();
    const claimRef = db.collection('terminalUsernames').doc(hash(data.username)), claim = await tx.get(claimRef);
    const oldClaimRef = saved && saved.username !== data.username ? db.collection('terminalUsernames').doc(hash(saved.username)) : null;
    const oldClaim = oldClaimRef ? await tx.get(oldClaimRef) : null;
    const owner = claim.exists ? claimSchema.safeParse(claim.data()) : null;
    if (owner && (!owner.success || owner.data.locationId !== locationId)) return conflict();
    if (oldClaim?.exists) { const oldOwner = claimSchema.safeParse(oldClaim.data()); if (!oldOwner.success || oldOwner.data.locationId !== locationId) return conflict(); }
    const value = credentialSchema.parse({ schemaVersion: 1, brandId: scope.brandId, locationId, username: data.username,
      salt: replacement?.salt ?? saved!.salt, passwordHash: replacement?.passwordHash ?? saved!.passwordHash,
      enabled: data.enabled, revision: (saved?.revision ?? 0) + 1, updatedAt: Date.now() });
    tx.set(ref, value); tx.set(claimRef, { schemaVersion: 1, locationId });
    if (oldClaimRef && oldClaim?.exists) tx.delete(oldClaimRef);
    tx.create(db.collection('auditLogs').doc(), { action: 'terminal_credentials_updated', brandId: scope.brandId, locationId,
      actorId: scope.identity.subject, revision: value.revision, enabled: value.enabled, createdAt: new Date() });
    return metadata(value, true);
  });
}
