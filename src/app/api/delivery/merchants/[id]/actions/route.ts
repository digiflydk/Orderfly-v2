import {merchantAction} from '@/lib/delivery/management/http';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){return merchantAction(request,(await context.params).id);}
