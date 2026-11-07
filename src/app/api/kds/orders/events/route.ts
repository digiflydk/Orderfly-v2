import { terminalEvents } from '@/lib/orders/terminal-events';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => terminalEvents(request, 'kds');
