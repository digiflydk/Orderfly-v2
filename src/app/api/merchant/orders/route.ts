import { AuthorityError } from '@/lib/access/authority';
import { readTerminalOrders, TerminalReadError } from '@/lib/orders/terminal-read';
import type { TerminalQuery } from '@/lib/orders/terminal-types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', Vary: 'Cookie' } });
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return reply({ error: 'terminal_invalid' }, 400);
    return reply(await readTerminalOrders(Object.fromEntries(params) as TerminalQuery));
  } catch (error) {
    if (error instanceof AuthorityError) return reply({ error: error.status === 401 ? 'unauthorized' : error.status === 403 ? 'forbidden' : 'terminal_unavailable' }, error.status === 401 || error.status === 403 ? error.status : 503);
    if (error instanceof TerminalReadError) return reply({ error: error.code }, error.status);
    return reply({ error: 'terminal_unavailable' }, 503);
  }
}
