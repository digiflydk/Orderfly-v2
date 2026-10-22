import { getReceiptSettings, putReceiptSettings } from '@/lib/receipts/settings-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = getReceiptSettings;
export const PUT = putReceiptSettings;
