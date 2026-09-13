import type { Brand } from '@/types';
import { campaignAttribution, normalizeAttribution, resolveAttribution } from './analytics-attribution';

export type BrandTrackingEvent = { event: string; brandId: string; [key: string]: unknown };
declare global {
  interface Window {
    orderflyBrandTracker?: { brandId: string; ready: boolean; statistics: boolean; marketing: boolean; emit: (event: BrandTrackingEvent) => void };
  }
}

// A removable document owns all brand scripts, globals and automatic listeners.
// Removing it tears down the previous brand's runtime during SPA navigation.
export function mountBrandTracking(brand: Brand, consent = { statistics: false, marketing: false }) {
  if (!consent.statistics && !consent.marketing) return () => {};
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.referrerPolicy = 'origin';
  frame.title = 'Brand analytics';
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  let stored;
  try {
    const name = `orderfly_attribution_${brand.id}=`;
    const cookie = consent.statistics ? document.cookie.split('; ').find(row => row.startsWith(name)) : undefined;
    stored = cookie ? normalizeAttribution(JSON.parse(decodeURIComponent(cookie.slice(name.length)))) : undefined;
  } catch { /* Ignore unavailable/corrupt optional attribution. */ }
  const attribution = resolveAttribution(campaignAttribution(new URLSearchParams(window.location.search), window.location.pathname, document.referrer), stored);
  if (attribution && !consent.marketing) { delete attribution.gclid; delete attribution.gbraid; delete attribution.wbraid; delete attribution.fbclid; }
  const landing = new URL(window.location.pathname, window.location.origin);
  for (const [field,param] of [['source','utm_source'],['medium','utm_medium'],['campaign','utm_campaign'],['campaignId','utm_id'],['term','utm_term'],['content','utm_content'],['gclid','gclid'],['gbraid','gbraid'],['wbraid','wbraid'],['fbclid','fbclid']] as const) {
    if (attribution?.[field]) landing.searchParams.set(param, attribution[field]!);
  }
  const config = JSON.stringify({
    origin: window.location.origin, brandId: brand.id, consent, gtm: consent.statistics ? brand.gtmContainerId : undefined, ga: consent.statistics ? brand.ga4MeasurementId : undefined,
    ads: consent.marketing ? brand.googleAdsConversionId : undefined,
    adsSendTo: consent.marketing && brand.googleAdsConversionId && brand.googleAdsPurchaseLabel ? `${brand.googleAdsConversionId}/${brand.googleAdsPurchaseLabel}` : undefined,
    meta: consent.marketing ? brand.metaPixelId : undefined,
    pageLocation: landing.href,
    pageReferrer: attribution?.referrerHost ? `https://${attribution.referrerHost}/` : '',
    attribution,
    campaign: { campaign_source: attribution?.source, campaign_medium: attribution?.medium, campaign_name: attribution?.campaign, campaign_id: attribution?.campaignId, campaign_term: attribution?.term, campaign_content: attribution?.content },
  }).replace(/</g, '\\u003c');
  frame.src = '/tracking/frame';
  let ready = false, stopped = false;
  const pending: BrandTrackingEvent[] = [];
  const send = (event: BrandTrackingEvent) => frame.contentWindow?.postMessage({ type: 'orderfly:brand-event', event }, window.location.origin);
  const handleReady = (event: MessageEvent) => {
    if (stopped || event.source !== frame.contentWindow || event.origin !== window.location.origin) return;
    if (event.data?.type === 'orderfly:frame-loaded') {
      frame.contentWindow?.postMessage({ type: 'orderfly:brand-init', config: JSON.parse(config) }, window.location.origin);
      return;
    }
    if (event.data?.type !== 'orderfly:brand-ready' || event.data.brandId !== brand.id) return;
    ready = true;
    tracker.ready = true;
    pending.splice(0).forEach(send);
    const waiting = window.orderflyPendingTracking || [];
    window.orderflyPendingTracking = [];
    waiting.filter(value => value.brandId === brand.id).forEach(send);
    window.dispatchEvent(new Event('orderfly:tracking-ready'));
  };
  const tracker = { brandId: brand.id, ready: false, statistics: consent.statistics && !!(brand.gtmContainerId || brand.ga4MeasurementId), marketing: consent.marketing && !!(brand.metaPixelId || brand.googleAdsConversionId && brand.googleAdsPurchaseLabel), emit(event: BrandTrackingEvent) {
    if (stopped || event.brandId !== brand.id) return;
    if (ready) send(event); else if (pending.length < 50) pending.push(event);
  } };
  window.addEventListener('message', handleReady);
  window.orderflyBrandTracker = tracker;
  document.body.appendChild(frame);
  return () => {
    stopped = true;
    window.removeEventListener('message', handleReady);
    if (window.orderflyBrandTracker === tracker) delete window.orderflyBrandTracker;
    pending.length = 0;
    frame.remove();
  };
}

// Served as a real same-origin document: vendor libraries reject about:srcdoc.
export const BRAND_TRACKING_DOCUMENT = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
  addEventListener('message',function initialize({source,origin,data}){
  if(source!==parent||origin!==location.origin||data?.type!=='orderfly:brand-init')return;
  const config=data.config;
  if(!config||config.origin!==location.origin||typeof config.brandId!=='string'||(!config.consent?.statistics&&!config.consent?.marketing))return;
  // Meta reads document.location; keep its URL aligned with sanitized storefront context.
  try{const page=new URL(config.pageLocation||'/',location.origin);if(page.origin!==location.origin)return;history.replaceState(null,'',page.href);}catch{return;}
  // Keep the real embedding origin: Meta uses it for iframe traffic permissions.
  let referrerHost='';try{referrerHost=new URL(config.pageReferrer).hostname;}catch{}
  removeEventListener('message',initialize);
  window.dataLayer=[];
  function gtag(){window.dataLayer.push(arguments);}
  function script(src){const tag=document.createElement('script');tag.async=true;tag.src=src;document.head.appendChild(tag);}
  // Basic consent: no runtime exists until a relevant purpose is granted.
  gtag('consent','default',{analytics_storage:config.consent.statistics?'granted':'denied',ad_storage:config.consent.marketing?'granted':'denied',ad_user_data:config.consent.marketing?'granted':'denied',ad_personalization:config.consent.marketing?'granted':'denied'});
  gtag('set','ads_data_redaction',!config.consent.marketing);
  gtag('set',{page_location:config.pageLocation,page_referrer:config.pageReferrer});
  if(config.gtm){dataLayer.push({event:'orderfly_tracking_ready',brandId:config.brandId,page_location:config.pageLocation,page_referrer:config.pageReferrer,...config.attribution});dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});script('https://www.googletagmanager.com/gtm.js?id='+encodeURIComponent(config.gtm));}
  // GTM owns GA4. Ads and Meta each have one explicit, consent-gated owner here.
  if((!config.gtm&&config.ga)||config.ads){script('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(config.ads||config.ga));gtag('js',new Date());if(!config.gtm&&config.ga)gtag('config',config.ga,{send_page_view:true,page_location:config.pageLocation,page_referrer:config.pageReferrer,...config.campaign});if(config.ads)gtag('config',config.ads,{send_page_view:false,page_location:config.pageLocation});}
  if(config.meta){const fbq=function(){fbq.callMethod?fbq.callMethod.apply(fbq,arguments):fbq.queue.push(arguments)};fbq.queue=[];fbq.push=fbq;fbq.loaded=true;fbq.version='2.0';window.fbq=fbq;window._fbq=fbq;script('https://connect.facebook.net/en_US/fbevents.js');fbq('set','autoConfig',false,config.meta);fbq('init',config.meta);fbq('trackSingle',config.meta,'PageView',{referrer_host:referrerHost});}
  addEventListener('message',({source,origin,data})=>{
    if(source!==parent||origin!==config.origin||data?.type!=='orderfly:brand-event'||data.event?.brandId!==config.brandId)return;
    const event=data.event;
    const mapping={view_menu:['view_item_list',null],view_product:['view_item','ViewContent'],add_to_cart:['add_to_cart','AddToCart'],start_checkout:['begin_checkout','InitiateCheckout'],click_purchase:['click_purchase',null],purchase:['purchase','Purchase']};
    const mapped=mapping[event.event];
    if(!mapped)return;
    const ecommerce=event.ecommerce||{currency:event.currency||'DKK',...(typeof event.cartValue==='number'?{value:event.cartValue}:{}),...(event.items?{items:event.items}:event.productId?{items:[{item_id:event.productId,quantity:event.itemsCount||1,...(typeof event.cartValue==='number'?{price:event.cartValue/(event.itemsCount||1)}:{})}]}:{})};
    const eventPage=new URL(config.pageLocation);
    if(typeof event.pagePath==='string'&&/^\\/[^?#]*$/.test(event.pagePath))eventPage.pathname=event.pagePath;
    const pageLocation=eventPage.href;
    history.replaceState(null,'',pageLocation);
    const parameters={...ecommerce,brand_id:config.brandId,location_id:event.locationId||ecommerce.location_id,...config.campaign,page_location:pageLocation,page_referrer:config.pageReferrer};
    if(config.consent.statistics&&event.destinations?.statistics!==false){
      if(config.gtm){dataLayer.push({ecommerce:null});dataLayer.push({event:mapped[0],ecommerce,brand_id:config.brandId,location_id:parameters.location_id,page_location:pageLocation,page_referrer:config.pageReferrer});}
      else if(config.ga)gtag('event',mapped[0],{...parameters,send_to:config.ga});
    }
    if(config.consent.marketing&&event.destinations?.marketing!==false){
      if(event.event==='purchase'&&config.adsSendTo)gtag('event','conversion',{send_to:config.adsSendTo,value:ecommerce.value,currency:ecommerce.currency,transaction_id:ecommerce.transaction_id,page_location:config.pageLocation});
      if(config.meta&&mapped[1])window.fbq('trackSingle',config.meta,mapped[1],{referrer_host:referrerHost,...(typeof ecommerce.value==='number'?{value:ecommerce.value}:{}),currency:ecommerce.currency,content_type:'product',...((ecommerce.items||[]).some(item=>item.item_name)?{content_name:(ecommerce.items||[]).map(item=>item.item_name).filter(Boolean).join(', ').slice(0,1000)}:{}),content_ids:(ecommerce.items||[]).map(item=>item.item_id),contents:(ecommerce.items||[]).map(item=>({id:item.item_id,quantity:item.quantity,item_price:item.price}))},{eventID:ecommerce.transaction_id||event.eventId});
    }
  });
  parent.postMessage({type:'orderfly:brand-ready',brandId:config.brandId},config.origin);
  });
  parent.postMessage({type:'orderfly:frame-loaded'},location.origin);
  </script></body></html>`;
