import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';

import { admin, getAdminDb } from '@/lib/firebase-admin';
import {
  type MpanelLaunchClaims,
  verifyMpanelLaunchCode,
} from '@/lib/auth/mpanel-superadmin-sso-contract';

export const SUPERADMIN_COOKIE = '__Host-orderfly_superadmin';
const SESSION_TTL_MS = 15 * 60 * 1000;

export type SuperadminSession = {
  employeeId: string;
  sourceSessionId: string;
  expiresAt: Date;
};

function required(name: string): string {
  const value = process.env[name]?.trim() ?? '';
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function secret(): string {
  const value = required('ORDERFLY_MPANEL_SSO_SECRET');
  if (value.length < 32) throw new Error('ORDERFLY_MPANEL_SSO_SECRET is invalid.');
  return value;
}

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function configuredEmployeeId(): string {
  return required('ORDERFLY_MPANEL_SUPERADMIN_EMPLOYEE_ID');
}

function parseLaunchCode(code: string): MpanelLaunchClaims | null {
  return verifyMpanelLaunchCode(code, {
    secret: secret(),
    employeeId: configuredEmployeeId(),
    issuer: required('ORDERFLY_MPANEL_SSO_ISSUER'),
    audience: required('ORDERFLY_MPANEL_SSO_AUDIENCE'),
  });
}

async function audit(event: string, outcome: 'accepted' | 'rejected', subject?: string, jti?: string) {
  try {
    await getAdminDb().collection('auditLogs').add({
      category: 'security',
      event,
      outcome,
      subjectHash: subject ? hash(subject) : null,
      jtiHash: jti ? hash(jti) : null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    // Authentication must fail closed independently of audit availability.
  }
}

export async function redeemLaunchCode(code: string): Promise<string | null> {
  let claims: MpanelLaunchClaims | null = null;
  try {
    claims = parseLaunchCode(code);
  } catch {
    await audit('mpanel_sso.invalid', 'rejected');
    return null;
  }
  if (!claims) {
    await audit('mpanel_sso.invalid', 'rejected');
    return null;
  }

  const db = getAdminDb();
  const redemptionRef = db.collection('integrationSsoRedemptions').doc(hash(claims.jti));
  const rawSession = randomBytes(32).toString('base64url');
  const sessionRef = db.collection('superadminSessions').doc(hash(rawSession));
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MS);

  try {
    await db.runTransaction(async transaction => {
      const redemption = await transaction.get(redemptionRef);
      if (redemption.exists) throw new Error('replayed');
      transaction.create(redemptionRef, {
        employeeIdHash: hash(claims!.sub),
        sourceSessionIdHash: hash(claims!.session_id),
        redeemedAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromMillis(claims!.exp * 1000),
      });
      transaction.create(sessionRef, {
        employeeId: claims!.sub,
        sourceSessionId: claims!.session_id,
        permission: 'orderfly.superadmin',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        revokedAt: null,
      });
    });
  } catch {
    await audit('mpanel_sso.replay_or_exchange_failure', 'rejected', claims.sub, claims.jti);
    return null;
  }

  await audit('mpanel_sso.redeemed', 'accepted', claims.sub, claims.jti);
  return rawSession;
}

export async function validateRawSuperadminSession(raw: string): Promise<SuperadminSession | null> {
  if (!raw || raw.length > 256) return null;
  try {
    const snapshot = await getAdminDb().collection('superadminSessions').doc(hash(raw)).get();
    if (!snapshot.exists) return null;
    const data = snapshot.data() ?? {};
    const expiresAt = data.expiresAt?.toDate?.() as Date | undefined;
    if (
      data.revokedAt ||
      data.permission !== 'orderfly.superadmin' ||
      data.employeeId !== configuredEmployeeId() ||
      !expiresAt ||
      expiresAt.getTime() <= Date.now()
    ) return null;
    return { employeeId: data.employeeId, sourceSessionId: data.sourceSessionId, expiresAt };
  } catch {
    return null;
  }
}

export async function currentSuperadminSession(): Promise<SuperadminSession | null> {
  const cookieStore = await cookies();
  return validateRawSuperadminSession(cookieStore.get(SUPERADMIN_COOKIE)?.value ?? '');
}

export async function revokeRawSuperadminSession(raw: string): Promise<void> {
  if (!raw || raw.length > 256) return;
  try {
    await getAdminDb().collection('superadminSessions').doc(hash(raw)).update({
      revokedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    // Clearing the browser cookie remains mandatory even if the record already expired.
  }
}

export const superadminCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_TTL_MS / 1000,
};
