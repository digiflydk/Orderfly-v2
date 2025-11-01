import * as admin from "firebase-admin";

let _app: admin.app.App | null = null;

function parseServiceAccount(raw: string): any {
  // Accept base64 or plain JSON; normalize newlines for private_key
  const decoded = (() => {
    try { return Buffer.from(raw, "base64").toString("utf8"); } catch { return raw; }
  })();
  const json = JSON.parse(decoded.replace(/\\n/g, "\n"));
  return json;
}

async function resolveProjectId(): Promise<string> {
  const envId =
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.GCP_PROJECT;
  if (envId) return envId;

  const fc = process.env.FIREBASE_CONFIG;
  if (fc) {
    try {
      const { projectId } = JSON.parse(fc);
      if (projectId) return projectId;
    } catch {
      /* ignore */
    }
  }

  try {
    const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
    const client = new SecretManagerServiceClient();
    const autoId = await client.getProjectId();
    if (autoId) return autoId as string;
  } catch {
    /* ignore */
  }

  throw new Error("GCP project id not resolved.");
}

async function loadServiceAccount(): Promise<any> {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) return parseServiceAccount(inline);

  const { SecretManagerServiceClient } = await import("@google-cloud/secret-manager");
  const client = new SecretManagerServiceClient();
  const projectId = await resolveProjectId();

  const [version] = await client.accessSecretVersion({
    name: `projects/${projectId}/secrets/FIREBASE_SERVICE_ACCOUNT_JSON/versions/latest`,
  });

  const payload = version.payload?.data?.toString("utf8") || "";
  if (!payload) throw new Error("Secret FIREBASE_SERVICE_ACCOUNT_JSON is empty.");
  return parseServiceAccount(payload);
}

/** Initialize and return the Admin app (singleton). */
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

/** Primary accessor for Firestore Admin (async). */
export async function getAdminDb(): Promise<admin.firestore.Firestore> {
  return (await getAdminApp()).firestore();
}

/** Helper for FieldValue if needed (async wrapper). */
export async function getAdminFieldValue() {
  const app = await getAdminApp();
  return app.firestore.FieldValue;
}
