import { headers } from "next/headers";

/**
 * Returnér en absolut base-URL fra nuværende request.
 * Fungerer på Firebase/Vercel/Node lokalt.
 */
export async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";

  if (host) return `${proto}://${host}`;

  // Fallbacks hvis headers ikke findes (edge cases)
  const env =
    process.env.NEXT_PUBLIC_BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return env || "http://localhost:3000";
}
