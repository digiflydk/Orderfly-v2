import { readGuestReceipt } from '@/lib/server/guest-receipt';
export const runtime = 'nodejs';
const reply = (body: object, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
} });
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const sessionId = query.get('session_id'), brandId = query.get('brand_id'), locationId = query.get('location_id');
  if (!sessionId || !brandId || !locationId) return reply({ found: false }, 400);
  try {
    const order = await readGuestReceipt({ sessionId, brandId, locationId, receiptToken: query.get('receipt_token') || undefined, orderId: query.get('order_id') || undefined });
    return reply(order ? { found: true, order } : { found: false });
  } catch { return reply({ found: false, retryable: true }, 503); }
}
