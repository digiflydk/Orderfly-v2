import 'server-only';
import type {RoutingAdapter} from '../routing/service';
import type {DeliveryProvider} from '../provider-contract';
export type ManagedDeliveryRuntime={routing:RoutingAdapter;provider:DeliveryProvider;pickupContact:{name:string;phone:string}};
/** No approved route service is configured. Runtime wiring requires separate spend/retention/launch approval. */
export async function resolveManagedDeliveryRuntime(_scope:{brandId:string;locationId:string}):Promise<ManagedDeliveryRuntime|null>{return null;}
