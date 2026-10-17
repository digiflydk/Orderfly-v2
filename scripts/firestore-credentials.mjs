// Credentials for the production data project, shared by the manual Firestore workflows.
// CI passes the FIREBASE_SERVICE_ACCOUNT_JSON secret; locally FIRESTORE_ACCESS_TOKEN
// (e.g. $(gcloud auth print-access-token)) or Application Default Credentials can be used.
import admin from 'firebase-admin';

export const PROJECT = process.env.FIRESTORE_PROJECT_ID || 'orderfly-39325';

function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  return raw ? JSON.parse(raw) : null;
}

// The account name and its home project are not secret; they say which principal needs an IAM role.
export function principal() {
  if (process.env.FIRESTORE_ACCESS_TOKEN) return 'the principal of FIRESTORE_ACCESS_TOKEN';
  const account = serviceAccount();
  return account ? `${account.client_email} (key project ${account.project_id})` : 'Application Default Credentials';
}

export async function accessToken() {
  if (process.env.FIRESTORE_ACCESS_TOKEN) return process.env.FIRESTORE_ACCESS_TOKEN;
  const account = serviceAccount();
  if (!account) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
  return (await admin.credential.cert(account).getAccessToken()).access_token;
}

export function firestore() {
  const account = serviceAccount();
  const credential = account ? admin.credential.cert(account) : admin.credential.applicationDefault();
  const app = admin.initializeApp({ credential, projectId: PROJECT }, 'firestore-operations');
  return app.firestore();
}
