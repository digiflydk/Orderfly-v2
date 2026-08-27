import { createHmac, timingSafeEqual } from 'node:crypto';

export const MPANEL_SSO_CODE_TTL_SECONDS = 60;

export type MpanelLaunchClaims = {
  v: 1;
  iss: string;
  aud: string;
  sub: string;
  session_id: string;
  jti: string;
  purpose: 'orderfly.superadmin';
  iat: number;
  nbf: number;
  exp: number;
};

export type MpanelSsoContractConfig = {
  secret: string;
  employeeId: string;
  issuer: string;
  audience: string;
};

export function verifyMpanelLaunchCode(
  code: string,
  config: MpanelSsoContractConfig,
  now = Math.floor(Date.now() / 1000),
): MpanelLaunchClaims | null {
  const [encoded, supplied, extra] = code.split('.');
  if (!encoded || !supplied || extra || code.length > 4096 || config.secret.length < 32) return null;
  let suppliedSignature: Buffer;
  try {
    suppliedSignature = Buffer.from(supplied, 'base64url');
  } catch {
    return null;
  }
  const expected = createHmac('sha256', config.secret).update(encoded, 'utf8').digest();
  if (suppliedSignature.length !== expected.length || !timingSafeEqual(suppliedSignature, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<MpanelLaunchClaims>;
    if (
      claims.v !== 1 ||
      claims.iss !== config.issuer ||
      claims.aud !== config.audience ||
      claims.purpose !== 'orderfly.superadmin' ||
      typeof claims.sub !== 'string' ||
      typeof claims.session_id !== 'string' ||
      typeof claims.jti !== 'string' ||
      typeof claims.iat !== 'number' ||
      typeof claims.nbf !== 'number' ||
      typeof claims.exp !== 'number' ||
      claims.sub !== config.employeeId ||
      claims.exp - claims.iat > MPANEL_SSO_CODE_TTL_SECONDS ||
      claims.iat > now + 5 ||
      claims.nbf > now + 5 ||
      claims.exp <= now
    ) return null;
    return claims as MpanelLaunchClaims;
  } catch {
    return null;
  }
}
