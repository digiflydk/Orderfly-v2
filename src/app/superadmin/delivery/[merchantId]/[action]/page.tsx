import {notFound} from 'next/navigation';
import {DeliveryMerchantPage} from '@/components/delivery/merchant-page';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{merchantId:string;action:string}>}){const {merchantId,action}=await params;if(!/^[a-f0-9]{64}$/.test(merchantId)||!['activate','deactivate','delete','restore'].includes(action))notFound();return <DeliveryMerchantPage merchantId={merchantId} action={action as 'activate'|'deactivate'|'delete'|'restore'}/>;}
