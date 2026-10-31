import 'server-only';
import {AsyncLocalStorage} from 'node:async_hooks';
const requests=new AsyncLocalStorage<Map<string,Promise<unknown>>>();
/** Server composition only. Fresh transaction validators never use this cache. */
export function withDeliveryRequest<T>(run:()=>Promise<T>):Promise<T>{return requests.run(new Map(),run);}
export function reuseDeliveryRead<T>(key:string,read:()=>Promise<T>):Promise<T>{
 const cache=requests.getStore();if(!cache)return read();
 let result=cache.get(key);if(!result){result=read();cache.set(key,result);}
 return result as Promise<T>;
}
