'use client';
import { useEffect, useState } from 'react';
const origins=new Set(['https://www.esmeraldapizza.dk','https://esmeraldapizza.dk']);
export default function MpanelLogin() {
  const [error,setError]=useState('');
  useEffect(()=>{
    const origin=new URLSearchParams(window.location.search).get('origin')||'',opener=window.opener;
    if(!origins.has(origin)||!opener){setError('Åbn Orderfly fra mPanel.');return;}
    let cancelled=false,redeeming=false;
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>{controller.abort();setError('Forbindelsen udløb. Start fra mPanel igen.');},60000);
    const call=async(body:object)=>{
      const response=await fetch('/api/admin/mpanel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});
      if(!response.ok)throw new Error();return response.json();
    };
    const receive=async(event:MessageEvent)=>{
      if(cancelled||redeeming||event.origin!==origin||event.source!==opener||event.data?.type!=='orderfly-launch-code'||!/^([0-9a-f]{64})\.([0-9a-f]{64})$/.test(event.data.code||''))return;
      redeeming=true;
      try{
        const result=await call({action:'redeem',code:event.data.code});
        if(cancelled)return;
        if(typeof result.path!=='string'||!result.path.startsWith('/superadmin/'))throw new Error();
        window.clearTimeout(timeout);opener.postMessage({type:'orderfly-launch-complete'},origin);
        window.opener=null;window.location.replace(result.path);
      }catch{if(!cancelled)setError('Din adgang kunne ikke bekræftes. Start fra mPanel igen.');}
    };
    window.addEventListener('message',receive);
    call({action:'start'}).then(data=>{if(!cancelled&&/^[0-9a-f]{64}$/.test(data.challenge||''))opener.postMessage({type:'orderfly-launch-ready',challenge:data.challenge},origin);else if(!cancelled)throw new Error();})
      .catch(()=>{if(!cancelled)setError('Forbindelsen kunne ikke oprettes. Start fra mPanel igen.');});
    return()=>{cancelled=true;controller.abort();window.clearTimeout(timeout);window.removeEventListener('message',receive);};
  },[]);
  return <main className="mx-auto max-w-md space-y-4 px-5 py-16">
    <h1 className="text-2xl font-bold">Åbn Orderfly</h1>
    {error?<><p role="alert">{error}</p><a className="underline" href="https://www.esmeraldapizza.dk/mpanel">Tilbage til mPanel</a></>:<p role="status">Bekræfter din adgang fra mPanel…</p>}
  </main>;
}
