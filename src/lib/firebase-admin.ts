
import 'server-only';
import * as admin from 'firebase-admin';

let db: admin.firestore.Firestore;

function getServiceAccount(): admin.ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
  }
  try {
    const parsed = JSON.parse(raw);
    // Minimal sanity
    const required = ['project_id','client_email','private_key'];
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
  const creds = getServiceAccount();
  admin.initializeApp({
    credential: admin.credential.cert(creds),
  });
}
db = admin.firestore();

export { db as getAdminDb, admin as getAdminApp };


export async function adminHealthProbe() {
  return { ok: true, ts: Date.now() };
}

export function getAdminFieldValue<T = unknown>(_path: string, _fallback?: T): T | undefined {
  return _fallback;
}
