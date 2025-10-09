
export const runtime = 'nodejs';
import { IMPORT_SWEEP_LIST } from '@/diag/importList';
import { logger } from '@/lib/logger';

export async function GET() {
  const results: Array<{ module: string; ok: boolean; error?: string }> = [];
  for (const mod of IMPORT_SWEEP_LIST) {
    try {
      // Dynamically import in a try/catch to catch import-time errors
      await import(mod);
      results.push({ module: mod, ok: true });
    } catch (e: any) {
      const msg = e?.message || String(e);
      logger.error('import failed', { module: mod, msg });
      results.push({ module: mod, ok: false, error: msg });
    }
  }
  return new Response(JSON.stringify({ ok: true, results }, null, 2), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
