import {notFound} from 'next/navigation';
import {DeliveryMerchantPage} from '@/components/delivery/merchant-page';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{merchantId:string}>}){const {merchantId}=await params;if(!/^[a-f0-9]{64}$/.test(merchantId))notFound();return <DeliveryMerchantPage merchantId={merchantId}/>;}
