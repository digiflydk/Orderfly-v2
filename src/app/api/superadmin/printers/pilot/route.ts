import { getPrinterPilotControl, postPrinterPilotControl } from '@/lib/printing/pilot-control-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = postPrinterPilotControl;
export const GET = getPrinterPilotControl;
