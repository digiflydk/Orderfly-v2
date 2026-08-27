import { createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';

import { verifyMpanelLaunchCode } from '../src/lib/auth/mpanel-superadmin-sso-contract';

const SECRET = 'test-only-secret-with-at-least-thirty-two-bytes';
const EMPLOYEE_ID = 'employee-omair';

function code(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const encoded = Buffer.from(JSON.stringify({
    v: 1,
    iss: 'esmeralda-mpanel',
    aud: 'orderfly-superadmin',
    sub: EMPLOYEE_ID,
    session_id: 'mpanel-session-1',
    jti: 'launch-1',
    purpose: 'orderfly.superadmin',
    iat: now,
    nbf: now,
    exp: now + 60,
    ...overrides,
  })).toString('base64url');
  const signature = createHmac('sha256', SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

test.beforeEach(() => {
  process.env.ORDERFLY_MPANEL_SSO_SECRET = SECRET;
  process.env.ORDERFLY_MPANEL_SUPERADMIN_EMPLOYEE_ID = EMPLOYEE_ID;
  process.env.ORDERFLY_MPANEL_SSO_ISSUER = 'esmeralda-mpanel';
  process.env.ORDERFLY_MPANEL_SSO_AUDIENCE = 'orderfly-superadmin';
});

const verifyLaunchCode = (value: string) => verifyMpanelLaunchCode(value, {
  secret: SECRET,
  employeeId: EMPLOYEE_ID,
  issuer: 'esmeralda-mpanel',
  audience: 'orderfly-superadmin',
});

test('accepts only the configured Omair employee identity and exact contract', () => {
  expect(verifyLaunchCode(code())?.sub).toBe(EMPLOYEE_ID);
  expect(verifyLaunchCode(code({ sub: 'another-admin' }))).toBeNull();
  expect(verifyLaunchCode(code({ purpose: 'orderfly.viewer' }))).toBeNull();
  expect(verifyLaunchCode(code({ aud: 'another-service' }))).toBeNull();
  expect(verifyLaunchCode(code({ iss: 'another-issuer' }))).toBeNull();
});

test('rejects expired, future, overlong and forged launch codes', () => {
  const now = Math.floor(Date.now() / 1000);
  expect(verifyLaunchCode(code({ iat: now - 61, exp: now - 1 }))).toBeNull();
  expect(verifyLaunchCode(code({ iat: now + 20, nbf: now + 20, exp: now + 60 }))).toBeNull();
  expect(verifyLaunchCode(code({ exp: now + 61 }))).toBeNull();
  expect(verifyLaunchCode(`${code()}forged`)).toBeNull();
});

test('protects all Superadmin page, API and Server Action requests at middleware', async () => {
  const middleware = await readFile(resolve(process.cwd(), 'middleware.ts'), 'utf8');
  expect(middleware).toContain("pathname.startsWith('/superadmin/')");
  expect(middleware).toContain("pathname.startsWith('/api/superadmin/')");
  expect(middleware).toContain('validateRawSuperadminSession');
  expect(middleware).toContain("runtime: 'nodejs'");
  expect(middleware).toContain('resolveProductionRedirect');
});

test('uses atomic replay consumption, opaque sessions and fixed redirect', async () => {
  const [integration, exchange] = await Promise.all([
    readFile(resolve(process.cwd(), 'src/lib/auth/mpanel-superadmin-sso.ts'), 'utf8'),
    readFile(resolve(process.cwd(), 'src/app/api/integrations/esmeralda/superadmin-sso/exchange/route.ts'), 'utf8'),
  ]);
  expect(integration).toContain('db.runTransaction');
  expect(integration).toContain('integrationSsoRedemptions');
  expect(integration).toContain('transaction.create(redemptionRef');
  expect(integration).toContain('superadminSessions');
  expect(integration).toContain('randomBytes(32)');
  expect(exchange).toContain("new URL('/superadmin/dashboard', request.url)");
  expect(exchange).not.toContain('redirect_uri');
});

test('runtime config is server-only and contains no committed values', async () => {
  const hosting = await readFile(resolve(process.cwd(), 'apphosting.yaml'), 'utf8');
  expect(hosting).toContain('secret: ORDERFLY_MPANEL_SSO_SECRET');
  expect(hosting).toContain('secret: ORDERFLY_MPANEL_SUPERADMIN_EMPLOYEE_ID');
  expect(hosting).not.toContain(EMPLOYEE_ID);
});
