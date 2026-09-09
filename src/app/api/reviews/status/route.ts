import { publicReviewsEnabled } from '@/lib/feedback/public-reviews';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get('brandId') || '';
  if (!/^[\w-]{1,160}$/.test(id)) return Response.json({ enabled: false }, { status: 400 });
  try { return Response.json({ enabled: await publicReviewsEnabled(id) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return Response.json({ enabled: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
