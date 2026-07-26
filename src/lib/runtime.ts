// No "use client"; server-only helper.
export function isAdminReady(): boolean {
  return !!(process.env.FB_SERVICE_ACCOUNT_JSON ?? process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
}
