/** Explicit demo-only backend binding. Never enables a production fallback. */
export const LOCAL_QA_PROJECT = 'demo-orderfly-qa0';
export function localQaEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const enabled = env.ORDERFLY_LOCAL_QA;
  if (enabled === undefined) {
    if (Object.hasOwn(env, 'FIRESTORE_EMULATOR_HOST') || Object.hasOwn(env, 'FIREBASE_AUTH_EMULATOR_HOST')) throw new Error('Local QA emulator mode is not explicitly enabled');
    return null;
  }
  if (enabled !== 'true' || env.NODE_ENV === 'production'
    || env.GCLOUD_PROJECT !== LOCAL_QA_PROJECT || env.GOOGLE_CLOUD_PROJECT !== LOCAL_QA_PROJECT
    || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== LOCAL_QA_PROJECT
    || env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8088' || env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
    || env.SITE_URL !== 'http://127.0.0.1:3100'
    || env.NEXT_PUBLIC_FIREBASE_API_KEY !== 'qa0-public-only' || env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN !== '127.0.0.1' || env.NEXT_PUBLIC_FIREBASE_APP_ID !== 'qa0-local') throw new Error('Local QA environment rejected');
  const bootstrap = { MPANEL_PLATFORM_ADMIN_EMPLOYEE_ID: '00000000-0000-4000-8000-000000000001', MPANEL_PLATFORM_ADMIN_ORGANIZATION_ID: '00000000-0000-4000-8000-000000000002' };
  for (const [key, value] of Object.entries(bootstrap)) if (env[key] !== value) throw new Error('Local QA bootstrap identifiers rejected');
  for (const key of Object.keys(env)) {
    if (Object.hasOwn(bootstrap, key)) continue;
    if (env[key] !== undefined && (/SERVICE_ACCOUNT|GOOGLE_APPLICATION_CREDENTIALS|CLOUDSDK|GCE_METADATA|GOOGLE_METADATA|GOOGLE_OAUTH|GCLOUD_ACCESS_TOKEN|FIREBASE_TOKEN|FIREBASE_CONFIG|STRIPE|SMTP|RESEND|SENDGRID|OMNISEND|MPANEL|WOLT|UBER|GOOGLE_AUTH/.test(key)
      || /PRINT_(?:INTENTS|OUTPUT|DISPATCH)_ENABLED/.test(key))) throw new Error('Local QA credentials or provider configuration rejected');
  }
  if (Reflect.get(globalThis, Symbol.for('orderfly.qa0.loopback-guard')) !== true) throw new Error('Local QA network guard is required');
  return Object.freeze({ projectId: LOCAL_QA_PROJECT, firestoreHost: env.FIRESTORE_EMULATOR_HOST, authHost: env.FIREBASE_AUTH_EMULATOR_HOST });
}
