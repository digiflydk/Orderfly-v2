import { handleTerminalConfig } from '@/lib/terminal-auth/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ locationId: string }> };
export async function GET(request: Request, context: Context) { return handleTerminalConfig(request, (await context.params).locationId); }
export async function PUT(request: Request, context: Context) { return handleTerminalConfig(request, (await context.params).locationId); }
