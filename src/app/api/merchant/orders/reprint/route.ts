import { handleMerchantReprint } from '@/lib/printing/merchant-reprint-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handleMerchantReprint;
export const POST = handleMerchantReprint;
