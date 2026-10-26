import {requirePlatformSuperuser} from '@/lib/access/orderfly-session';
import {nativeCatalog} from '@/lib/access/native-catalog';
import {AccessDeniedPage} from '@/components/superadmin/access-denied-page';
import {DeliveryMerchantOverview} from './merchant-overview';
import {DeliveryMerchantDetail} from './merchant-detail';
import {DeliveryPlatformSettings} from './platform-settings';
export async function DeliveryMerchantPage({merchantId,action,create=false,platform=false}:{merchantId?:string;action?:'activate'|'deactivate'|'delete'|'test'|'register_callback'|'restore';create?:boolean;platform?:boolean}){
 try{await requirePlatformSuperuser();if(platform)return <DeliveryPlatformSettings/>;const native=await nativeCatalog('orderfly.catalog:view');const catalog={brands:native.brands.map(({id,name})=>({id,name})),locations:native.locations.map(({id,name,brandId})=>({id,name,brandId}))};
 return create||merchantId?<DeliveryMerchantDetail merchantId={merchantId} action={action} catalog={catalog} canEdit/>:<DeliveryMerchantOverview {...catalog} canEdit platformAdmin/>;
 }catch(error){if([401,403].includes((error as {status?:number})?.status||0))return <AccessDeniedPage/>;return <div role="alert"><h1 className="text-2xl font-bold">Levering</h1><p>Leveringsmodulet kunne ikke indlæses. Genindlæs siden.</p></div>;}
}
