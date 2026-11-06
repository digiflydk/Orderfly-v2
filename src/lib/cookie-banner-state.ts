/** Same version check on the server and after hydration; no consent is inferred. */
export function shouldShowCookieBanner(raw: string | null | undefined, version: string): boolean {
  if (!raw) return true;
  try {
    if (!raw.trim().startsWith('{') || !raw.trim().endsWith('}')) return true;
    return JSON.parse(raw).consent_version !== version;
  } catch { return true; }
}
