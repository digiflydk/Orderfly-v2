export const runtime = 'nodejs';
export async function GET() {
  return new Response(JSON.stringify({ ok:true, ts: Date.now(), safe: process.env.OF_SAFE_MODE === '1' }), { status: 200 });
}
