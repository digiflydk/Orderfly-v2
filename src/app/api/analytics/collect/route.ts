export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { name, params } = await req.json().catch(() => ({}));
  const measurement_id = process.env.GA_MEASUREMENT_ID || process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '';
  const api_secret = process.env.GA_API_SECRET || '';
  if (!measurement_id || !api_secret) return new Response(null, { status: 204 });

  // simpelt client_id (kan udskiftes med rigtigt cookie-id)
  const client_id = 'web.' + Math.random().toString(36).slice(2);

  await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurement_id}&api_secret=${api_secret}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id, events: [{ name: name || 'page_view', params: params || {} }] }),
  }).catch(() => { /* ignore */ });

  return new Response(null, { status: 204 });
}
