
import 'server-only';
import * as admin from 'firebase-admin';

// Helper to check if we're in a production-like environment
function isProdLike() {
  const env = process.env.NODE_ENV || 'development';
  return env.toLowerCase() === 'production';
}

function getServiceAccount(): admin.ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
  }
  try {
    const parsed = JSON.parse(raw);
    const required = ['project_id', 'client_email', 'private_key'];
    for (const k of required) {
      if (!parsed[k]) throw new Error(`Missing field in service account: ${k}`);
    }
    // Some providers strip \n; fix if needed
    if (typeof parsed.private_key === 'string') {
      parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    }
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key,
    };
  } catch (e: any) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${e?.message ?? 'parse error'}`);
  }
}

if (!admin.apps.length) {
  const serviceAccount = getServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

export const getAdminDb = () => admin.firestore();
export const getAdminApp = () => admin.app();
export const getAdminFieldValue = () => admin.firestore.FieldValue;

export async function adminHealthProbe() {
  try {
    await getAdminDb().listCollections();
    return { ok: true, ts: Date.now() };
  } catch (e: any) {
    return { ok: false, error: e.message, code: e.code };
  }
}
