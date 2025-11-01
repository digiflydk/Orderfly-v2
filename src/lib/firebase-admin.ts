'use server';

import * as admin from "firebase-admin";

let _app: admin.app.App | null = null;

function parseKey(raw: string): any {
  // prøv base64 først, ellers rå JSON (med \n-fix)
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    return JSON.parse(raw.replace(/\\n/g, "\n"));
  }
}

async function loadServiceAccount(): Promise<any> {
  const env = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (env) return parseKey(env);

  // Fallback til Secret Manager (kun hvis env mangler)
  const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
  const client = new SecretManagerServiceClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (!projectId) throw new Error("GCP project id not resolved.");

  const [version] = await client.accessSecretVersion({
    name: `projects/${projectId}/secrets/FIREBASE_SERVICE_ACCOUNT_JSON/versions/latest`,
  });
  const payload = version.payload?.data?.toString("utf8") || "";
  if (!payload) throw new Error("Secret FIREBASE_SERVICE_ACCOUNT_JSON is empty.");
  return parseKey(payload);
}

export async function getAdminApp(): Promise<admin.app.App> {
  if (_app) return _app;
  const svc = await loadServiceAccount();
  _app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId: svc.project_id,
      clientEmail: svc.client_email,
      privateKey: svc.private_key,
    }),
  });
  return _app;
}

export async function getAdminDb(): Promise<admin.firestore.Firestore> {
  return (await getAdminApp()).firestore();
}
