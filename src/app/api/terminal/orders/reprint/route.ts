import { handleMerchantReprint } from '@/lib/printing/merchant-reprint-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (request: Request) => handleMerchantReprint(request, true);
export const POST = (request: Request) => handleMerchantReprint(request, true);
