import 'server-only';
import type { RoutingAdapter, VerifiedAddress } from '../service';

const GEOCODE = 'https://maps.googleapis.com/maps/api/geocode/json';
const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const text = (v:unknown,max=200):v is string => typeof v==='string' && !!v.trim() && v.length<=max;
const point=(p:VerifiedAddress)=>p && text(p.reference) && Number.isFinite(p.latitude) && Math.abs(p.latitude)<=90 && Number.isFinite(p.longitude) && Math.abs(p.longitude)<=180;
/** Optional server-only adapter. No registration, secret lookup, API enablement or live request at construction. */
export function createGoogleRoutingAdapter(options:{apiKey:string;fetch:typeof fetch;timeoutMs?:number}):RoutingAdapter {
  if (!text(options.apiKey,300) || /\s/.test(options.apiKey)) throw Error('invalid_routing_configuration');
  const timeoutMs=options.timeoutMs??4000;
  if (!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000) throw Error('invalid_routing_configuration');
  const request=async(url:string,init:RequestInit):Promise<any>=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('routing_timeout'));},timeoutMs)});
    try { return await Promise.race([timeout,(async()=>{
      const response=await options.fetch(url,{...init,signal:controller.signal,redirect:'error',cache:'no-store'});
      if (!response.ok) throw Error('routing_http_error');
      // Responses are kept in memory for this request only. Never log URL/key/body or raw errors.
      const body=await response.text();if (body.length>1000000) throw Error('routing_response_too_large');
      return JSON.parse(body);
    })()]); } finally {if(timer)clearTimeout(timer);}
  };
  return {
    source:'google_maps',
    async resolve(address){
      if (!address || !text(address.street)||!text(address.postalCode,30)||!text(address.city,120)||!/^[A-Z]{2}$/.test(address.countryCode)) return {kind:'invalid'};
      const params=new URLSearchParams({address:`${address.street}, ${address.postalCode} ${address.city}`,components:`country:${address.countryCode}`,key:options.apiKey});
      try {
        const data=await request(`${GEOCODE}?${params}`,{method:'GET'});
        if (data?.status==='ZERO_RESULTS')return {kind:'invalid'};
        if (data?.status!=='OK'||!Array.isArray(data.results))return {kind:'unavailable'};
        if(data.results.length!==1)return {kind:'ambiguous'};
        const r=data.results[0];
        if(r?.partial_match===true||r?.geometry?.location_type!=='ROOFTOP')return {kind:'ambiguous'};
        const components=r.address_components;
        if(!Array.isArray(components))return {kind:'invalid'};
        const component=(type:string)=>components.find((c:any)=>Array.isArray(c?.types)&&c.types.includes(type));
        if(component('country')?.short_name!==address.countryCode || component('postal_code')?.long_name?.replace(/\s/g,'').toUpperCase()!==address.postalCode.replace(/\s/g,'').toUpperCase())return {kind:'ambiguous'};
        const number=component('street_number')?.long_name,street=component('route')?.long_name;
        if(!text(number,60)||!text(street))return {kind:'ambiguous'};
        const normalize=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
        if(![`${street} ${number}`,`${number} ${street}`].some(s=>normalize(s)===normalize(address.street)))return {kind:'ambiguous'};
        const result={reference:r.place_id,latitude:r?.geometry?.location?.lat,longitude:r?.geometry?.location?.lng};
        if(!point(result))return {kind:'invalid'};
        return {kind:'verified',address:result};
      }catch{return {kind:'unavailable'};}
    },
    async route({pickup,dropoff,profile}){
      if(profile!=='car'||!point(pickup)||!point(dropoff))return {kind:'unavailable'};
      const waypoint=(p:VerifiedAddress)=>({location:{latLng:{latitude:p.latitude,longitude:p.longitude}}});
      try{
        const data=await request(ROUTES,{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':options.apiKey,'X-Goog-FieldMask':'routes.distanceMeters,routes.duration'},body:JSON.stringify({origin:waypoint(pickup),destination:waypoint(dropoff),travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',computeAlternativeRoutes:false})});
        if(!Array.isArray(data?.routes))return {kind:'unavailable'};
        if(data.routes.length===0)return {kind:'no_route'};
        if(data.routes.length!==1)return {kind:'unavailable'};
        const route=data.routes[0];
        if(!Number.isSafeInteger(route?.distanceMeters)||route.distanceMeters<0||typeof route.duration!=='string'||!/^\d+(?:\.\d{1,9})?s$/.test(route.duration))return {kind:'unavailable'};
        const durationSeconds=Math.ceil(Number(route.duration.slice(0,-1)));
        if(!Number.isSafeInteger(durationSeconds))return {kind:'unavailable'};
        return {kind:'route',meters:route.distanceMeters,durationSeconds};
      }catch{return {kind:'unavailable'};}
    },
  };
}
