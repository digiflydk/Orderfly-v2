export const runtime = 'nodejs';
import { getKpis } from '@/lib/kpis.server';

export async function GET() {
  try {
    const data = await getKpis();
    return Response.json({ ok: true, data });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message || 'Failed to load KPIs' }, { status: 500 });
  }
}
