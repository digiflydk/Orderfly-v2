import { handleTerminalSession } from '@/lib/terminal-auth/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handleTerminalSession;
export const POST = handleTerminalSession;
