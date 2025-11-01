export function isAdminEnvReady(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
}
