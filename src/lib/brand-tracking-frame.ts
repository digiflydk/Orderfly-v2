import type { Brand } from '@/types';
import { campaignAttribution, normalizeAttribution, resolveAttribution } from './analytics-attribution';

export type BrandTrackingEvent = { event: string; brandId: string; [key: string]: unknown };
declare global {
  interface Window {
    orderflyBrandTracker?: { brandId: string; emit: (event: BrandTrackingEvent) => void };
  }
}

// A removable document owns all brand scripts, globals and automatic listeners.
// Removing it tears down the previous brand's runtime during SPA navigation.
export function mountBrandTracking(brand: Brand) {
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.title = 'Brand analytics';
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  let stored;
  try {
    const name = `orderfly_attribution_${brand.id}=`;
    const cookie = document.cookie.split('; ').find(row => row.startsWith(name));
    stored = cookie ? normalizeAttribution(JSON.parse(decodeURIComponent(cookie.slice(name.length)))) : undefined;
  } catch { /* Ignore unavailable/corrupt optional attribution. */ }
  const attribution = resolveAttribution(campaignAttribution(new URLSearchParams(window.location.search), window.location.pathname, document.referrer), stored);
  const landing = new URL(attribution?.landingPath || window.location.pathname, window.location.origin);
  for (const [field,param] of [['source','utm_source'],['medium','utm_medium'],['campaign','utm_campaign'],['campaignId','utm_id'],['term','utm_term'],['content','utm_content'],['gclid','gclid'],['gbraid','gbraid'],['wbraid','wbraid'],['fbclid','fbclid']] as const) {
    if (attribution?.[field]) landing.searchParams.set(param, attribution[field]!);
  }
  const config = JSON.stringify({
    origin: window.location.origin, brandId: brand.id, gtm: brand.gtmContainerId, ga: brand.ga4MeasurementId,
    ads: brand.googleAdsConversionId,
    adsSendTo: brand.googleAdsConversionId && brand.googleAdsPurchaseLabel ? `${brand.googleAdsConversionId}/${brand.googleAdsPurchaseLabel}` : undefined,
    meta: brand.metaPixelId,
    pageLocation: landing.href,
    attribution,
    campaign: { campaign_source: attribution?.source, campaign_medium: attribution?.medium, campaign_name: attribution?.campaign, campaign_id: attribution?.campaignId, campaign_term: attribution?.term, campaign_content: attribution?.content },
  }).replace(/</g, '\\u003c');
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
  const config=${config};
  window.dataLayer=[];
  function gtag(){window.dataLayer.push(arguments);}
  function script(src){const tag=document.createElement('script');tag.async=true;tag.src=src;document.head.appendChild(tag);}
  if(config.gtm){dataLayer.push({event:'orderfly_tracking_ready',brandId:config.brandId,page_location:config.pageLocation,...config.attribution});dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});script('https://www.googletagmanager.com/gtm.js?id='+encodeURIComponent(config.gtm));}
  else if(config.ga||config.ads){script('https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(config.ga||config.ads));gtag('js',new Date());if(config.ga)gtag('config',config.ga,{send_page_view:true,page_location:config.pageLocation,...config.campaign});if(config.ads)gtag('config',config.ads,{send_page_view:false});}
  if(config.meta){const fbq=function(){fbq.callMethod?fbq.callMethod.apply(fbq,arguments):fbq.queue.push(arguments)};fbq.queue=[];fbq.loaded=true;fbq.version='2.0';window.fbq=fbq;script('https://connect.facebook.net/en_US/fbevents.js');fbq('init',config.meta);fbq('trackSingle',config.meta,'PageView');}
  addEventListener('message',({source,data})=>{
    if(source!==parent||data?.type!=='orderfly:brand-event'||data.event?.brandId!==config.brandId)return;
    const event=data.event;
    if(config.gtm)dataLayer.push(event);
    if(event.event==='purchase'){
      if(!config.gtm&&config.ga)gtag('event','purchase',{...event.ecommerce,...config.campaign,page_location:config.pageLocation,send_to:config.ga});
      if(!config.gtm&&config.adsSendTo)gtag('event','conversion',{send_to:config.adsSendTo,value:event.ecommerce.value,currency:event.ecommerce.currency,transaction_id:event.ecommerce.transaction_id});
      if(config.meta)window.fbq('trackSingle',config.meta,'Purchase',{value:event.ecommerce.value,currency:event.ecommerce.currency},{eventID:event.ecommerce.transaction_id});
    }
  });
  parent.postMessage({type:'orderfly:brand-ready',brandId:config.brandId},config.origin);
  </script></body></html>`;
  let ready = false, stopped = false;
  const pending: BrandTrackingEvent[] = [];
  const send = (event: BrandTrackingEvent) => frame.contentWindow?.postMessage({ type: 'orderfly:brand-event', event }, window.location.origin);
  const handleReady = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== window.location.origin || event.data?.type !== 'orderfly:brand-ready' || event.data.brandId !== brand.id) return;
    ready = true;
    pending.splice(0).forEach(send);
  };
  const tracker = { brandId: brand.id, emit(event: BrandTrackingEvent) {
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
