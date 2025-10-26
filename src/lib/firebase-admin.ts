
import 'server-only';
import * as admin from 'firebase-admin';

type SA = { project_id: string; client_email: string; private_key: string };

function parseServiceAccountJSON(): { projectId: string; clientEmail: string; privateKey: string } {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');

  raw = raw.trim();
  // Accept raw JSON or base64-encoded JSON
  const looksBase64 = !raw.startsWith('{');
  if (looksBase64) {
    try { raw = Buffer.from(raw, 'base64').toString('utf8'); }
    catch { throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON looks base64 but cannot be decoded.'); }
  }

  let sa: SA;
  try { sa = JSON.parse(raw) as SA; }
  catch (e: any) { throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${e?.message ?? 'parse error'}`); }

  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new Error('Service account missing project_id/client_email/private_key.');
  }

  const privateKey = sa.private_key.replace(/\\n/g, '\n');
  return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey };
}

function assertNoADC() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS is set — remove it to avoid ADC fallback.');
  }
}

if (!admin.apps.length) {
  assertNoADC();
  const { projectId, clientEmail, privateKey } = parseServiceAccountJSON();
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    projectId,
  });
}

export const getAdminDb = () => admin.firestore();
export const getAdminFieldValue = () => admin.firestore.FieldValue;
export async function adminHealthProbe() {
    try {
        await getAdminDb().collection('__health_check__').limit(1).get();
        return { ok: true, ts: Date.now() };
    } catch(e:any) {
        return { ok: false, error: e.message, code: e.code };
    }
}
