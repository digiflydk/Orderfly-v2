import {merchantItem} from '@/lib/delivery/management/http';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request,context:{params:Promise<{id:string}>}){return merchantItem(request,(await context.params).id);}
export async function PUT(request:Request,context:{params:Promise<{id:string}>}){return merchantItem(request,(await context.params).id);}
