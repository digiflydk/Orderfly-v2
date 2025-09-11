export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';
export const HAS_GA = !!GA_MEASUREMENT_ID;

export function pageView(path: string) {
  if (!HAS_GA || typeof window === 'undefined' || !(window as any).gtag) return;
  (window as any).gtag('event', 'page_view', { page_path: path });
}

export async function sendEvent(name: string, params: Record<string, any> = {}) {
  try {
    await fetch('/api/analytics/collect', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, params }),
      keepalive: true,
    });
  } catch { /* ignore */ }
}
