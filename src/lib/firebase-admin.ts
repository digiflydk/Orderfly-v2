
import 'server-only';
import * as admin from 'firebase-admin';

type SA = { project_id: string; client_email: string; private_key: string };

function loadServiceAccount(): { projectId: string; clientEmail: string; privateKey: string } {
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
  raw = raw.trim();

  // Accept both base64 and raw JSON
  const looksBase64 = !raw.startsWith('{');
  if (looksBase64) {
    try {
      raw = Buffer.from(raw, 'base64').toString('utf8');
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON looks base64 but cannot be decoded.');
    }
  }

  let sa: SA;
  try {
    sa = JSON.parse(raw) as SA;
  } catch (e: any) {
    throw new Error(`Invalid FIREBASE_SERVICE_ACCOUNT_JSON: ${e?.message ?? 'parse error'}`);
  }

  if (!sa.project_id || !sa.client_email || !sa.private_key) {
    throw new Error('Missing project_id, client_email, or private_key in service account.');
  }

  const privateKey = sa.private_key.replace(/\\n/g, '\n');
  return { projectId: sa.project_id, clientEmail: sa.client_email, privateKey };
}

function assertNoADC() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error(
      'GOOGLE_APPLICATION_CREDENTIALS is set. Remove it to avoid ADC fallback. We require explicit cert init.'
    );
  }
}

const globalAny = globalThis as any;
if (!globalAny.__OF_ADMIN_APP__) {
  assertNoADC();
  const { projectId, clientEmail, privateKey } = loadServiceAccount();
  const app = admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    projectId,
  });

  const credName = (app.options as any)?.credential?.constructor?.name;
  if (credName !== 'CertCredential') {
    throw new Error(`Firebase Admin initialized with ${credName}, expected CertCredential.`);
  }

  globalAny.__OF_ADMIN_APP__ = app;
}

export const adminApp = (globalThis as any).__OF_ADMIN_APP__ as admin.app.App;

export const getAdminDb = () => {
    return admin.firestore(adminApp);
};

export function _adminDebugInfo() {
  return {
    appsCount: admin.apps.length,
    projectId: (adminApp.options as any).projectId,
    cred: (adminApp.options as any)?.credential?.constructor?.name,
  };
}
export { admin };

export const getAdminFieldValue = () => {
    // This is a simplified getter for FieldValues like serverTimestamp.
    // In a more complex setup, you might need to handle multiple Firebase app instances.
    return admin.firestore.FieldValue;
};


export async function adminHealthProbe() {
    try {
        await getAdminDb().collection('__health_check__').limit(1).get();
        return { ok: true, ts: Date.now() };
    } catch(e:any) {
        return { ok: false, error: e.message, code: e.code };
    }
}
