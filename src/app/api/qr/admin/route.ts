import 'server-only';
import { getOrigin } from '@/lib/url';
import { executeQrCommand } from '@/lib/qr/runtime';
import { qrAdminHttp } from '@/lib/qr/http';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){return qrAdminHttp(request,{origin:await getOrigin(),execute:executeQrCommand});}
