export async function GET(request:Request){
  const brand=new URL(request.url).searchParams.get('brand')||'';
  if(!/^[a-z0-9-]{1,100}$/.test(brand))return new Response('',{status:400});
  const origin=new URL(request.url).origin;
  const js=`(()=>{const script=document.currentScript;if(!script)return;const key='orderfly-game-embed-${brand}';try{if(Number(localStorage.getItem(key))>Date.now())return}catch{}const frame=document.createElement('iframe');frame.title='Skrab og vind';frame.loading='lazy';frame.referrerPolicy='origin';frame.style.cssText='display:block;width:100%;height:780px;max-width:680px;margin:auto;border:0;background:transparent';frame.src=${JSON.stringify(`${origin}/games/${brand}?embed=1&path=`)}+encodeURIComponent(location.pathname);script.parentNode.insertBefore(frame,script.nextSibling);window.addEventListener('message',event=>{if(event.origin!==${JSON.stringify(origin)}||event.source!==frame.contentWindow||event.data?.type!=='orderfly-game-played'||!Number.isFinite(event.data.until))return;try{localStorage.setItem(key,String(event.data.until))}catch{}})})();`;
  return new Response(js,{headers:{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'public,max-age=300','X-Content-Type-Options':'nosniff'}});
}
