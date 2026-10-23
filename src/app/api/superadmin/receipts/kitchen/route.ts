import { getKitchenSettings, putKitchenSettings } from '@/lib/receipts/kitchen-settings-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = getKitchenSettings;
export const PUT = putKitchenSettings;
