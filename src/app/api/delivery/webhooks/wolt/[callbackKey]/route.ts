import { receiveNativeWoltCallback } from '@/lib/delivery/events/wolt-inbox';
export const runtime='nodejs';
export async function POST(request:Request,context:{params:Promise<{callbackKey:string}>}){return receiveNativeWoltCallback(request,(await context.params).callbackKey);}
