import { postPrinterDeviceCredential } from '@/lib/printing/device-credentials-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const POST = postPrinterDeviceCredential;

export { getPrinterCredentialMetadata as GET } from '@/lib/printing/device-credentials-metadata-http';
