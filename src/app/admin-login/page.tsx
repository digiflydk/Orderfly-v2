'use client';
import { Suspense, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSearchParams } from 'next/navigation';

function AdminLoginForm() {
  const merchantLogin=useSearchParams().get('next')==='/merchant';
  const [method,setMethod]=useState<'opsfly'|'firebase'>('opsfly');
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const [ready,setReady]=useState(false);
  useEffect(()=>{setReady(true);},[]);
  return <main className="flex min-h-screen items-center justify-center bg-[#f6f8fa] px-4 py-8">
    <section aria-labelledby="admin-login-heading" className="w-full max-w-[440px] rounded-2xl border border-[#dce4e9] bg-white px-[30px] py-8">
      <header className="mb-7 text-center">
        <p className="mb-2 text-2xl font-bold tracking-tight text-[#087f9f]">Orderfly</p>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#087f9f]">ORDER MANAGEMENT</p>
      </header>
      <h1 id="admin-login-heading" className="text-[28px] font-bold leading-tight tracking-tight text-[#19232d] sm:text-4xl">{merchantLogin?'RESTAURANT LOGIN':'ADMINISTRATION'}</h1>
      <p className="mt-3 text-sm leading-5 text-[#5b6d7d]">{method==='opsfly'?'Ét login til Orderflys administrationsmodul.':'Log ind med din Orderfly-konto.'}</p>
      <form className="mt-5 space-y-4" onSubmit={async event=>{
      event.preventDefault();if(!ready||pending)return;
      const data=new FormData(event.currentTarget);setPending(true);setError('');
      let clearFirebase:(()=>Promise<void>)|undefined;
      try {
        let payload:Record<string,string>;
        if(method==='opsfly')payload={provider:'opsfly',identifier:String(data.get('identifier')),pin:String(data.get('password'))};
        else {
          // The default Opsfly path must work without a Firebase Auth provider.
          await import('@/lib/firebase');
          const [{getApp},{getAuth,inMemoryPersistence,setPersistence,signInWithEmailAndPassword,signOut}]=await Promise.all([import('firebase/app'),import('firebase/auth')]);
          const auth=getAuth(getApp());clearFirebase=()=>signOut(auth);
          await setPersistence(auth,inMemoryPersistence);
          const user=await signInWithEmailAndPassword(auth,String(data.get('identifier')),String(data.get('password')));
          payload={idToken:await user.user.getIdToken()};
        }
        const response=await fetch('/api/admin/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if(!response.ok){
          setError(response.status===429?'For mange forsøg. Vent 10 minutter og prøv igen.':response.status===503?'Login er midlertidigt utilgængeligt. Prøv igen.':'Kunne ikke logge ind. Kontrollér dine loginoplysninger og din adgang i mPanel.');
          return;
        }
        const body=await response.json().catch(()=>({}));
        // A new login restarts the counter view's idle timer (see merchant/stamp-card).
        try{sessionStorage.setItem('orderfly.counter.fresh-login','1');}catch{/* Private mode. */}
        await clearFirebase?.();window.location.assign(body?.home==='/merchant/stamp-card'?body.home:merchantLogin?'/merchant':'/superadmin/sales/orders');
      } catch {setError('Kunne ikke logge ind. Prøv igen.');}
      finally {await clearFirebase?.().catch(()=>{});setPending(false);}
    }}>
      {error&&<p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      <div className="space-y-2"><Label htmlFor="identifier" className="text-sm font-normal text-[#5b6d7d]">{method==='opsfly'?'Navn / E-mail':'E-mail'}</Label><Input key={method+'-identifier'} id="identifier" name="identifier" type={method==='opsfly'?'text':'email'} autoComplete="username" required maxLength={160} disabled={!ready||pending} className="border-[#b7c8d4] bg-[#e8f1ff] text-sm focus-visible:ring-[#087f9f]"/></div>
      <div className="space-y-2"><Label htmlFor="password" className="text-sm font-normal text-[#5b6d7d]">{method==='opsfly'?'6-cifret PIN':'Adgangskode'}</Label><Input key={method+'-password'} id="password" name="password" type="password" autoComplete="current-password" inputMode={method==='opsfly'?'numeric':undefined} pattern={method==='opsfly'?'[0-9]{6}':undefined} minLength={method==='opsfly'?6:undefined} maxLength={method==='opsfly'?6:undefined} required disabled={!ready||pending} className="border-[#b7c8d4] bg-[#e8f1ff] text-sm focus-visible:ring-[#087f9f]"/></div>
      <Button className="mt-1 w-full rounded-md bg-[#087f9f] font-bold text-white hover:bg-[#076d89]" disabled={!ready||pending}>{pending?'LOGGER IND…':'LOG IND'}</Button>
    </form>
      <div className="mt-4 text-center">
        <Button type="button" variant="link" className="h-auto max-w-full whitespace-normal px-0 text-sm text-[#087f9f]" disabled={!ready||pending} onClick={()=>{setMethod(method==='opsfly'?'firebase':'opsfly');setError('');}}>{method==='opsfly'?'Log ind med en separat Orderfly-konto':'Log ind med Opsfly'}</Button>
      </div>
    </section>
  </main>;
}

export default function AdminLogin(){return <Suspense fallback={<main className="p-8">Indlæser login…</main>}><AdminLoginForm/></Suspense>;}
