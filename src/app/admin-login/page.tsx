'use client';
import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OrderFlyLogo } from '@/components/icons';
import { useSearchParams } from 'next/navigation';

function AdminLoginForm() {
  const merchantLogin=useSearchParams().get('next')==='/merchant';
  const [method,setMethod]=useState<'opsfly'|'firebase'>('opsfly');
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
    <section aria-labelledby="admin-login-heading" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <header className="mb-8 text-center">
        <div className="mb-2 flex items-center justify-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
          <OrderFlyLogo aria-hidden="true" className="h-7 w-7 text-primary" />
          <span>Orderfly</span>
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">Administration</p>
      </header>
      <h1 id="admin-login-heading" className="text-2xl font-bold tracking-tight text-slate-900">{merchantLogin?'Log ind til restaurantens spil':'Log ind til Orderfly'}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{method==='opsfly'?'Brug din e-mail eller dit brugernavn og den samme PIN som i Opsfly.':'Brug din Orderfly-konto med e-mail og adgangskode.'}</p>
      <form className="mt-6 space-y-5" onSubmit={async event=>{
      event.preventDefault();if(pending)return;
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
        await clearFirebase?.();window.location.assign(merchantLogin?'/merchant':'/superadmin/sales/orders');
      } catch {setError('Kunne ikke logge ind. Prøv igen.');}
      finally {await clearFirebase?.().catch(()=>{});setPending(false);}
    }}>
      {error&&<p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="space-y-2"><Label htmlFor="identifier">{method==='opsfly'?'E-mail eller brugernavn':'E-mail'}</Label><Input key={method+'-identifier'} id="identifier" name="identifier" type={method==='opsfly'?'text':'email'} autoComplete="username" required maxLength={160} disabled={pending}/></div>
      <div className="space-y-2"><Label htmlFor="password">{method==='opsfly'?'PIN (6 cifre)':'Adgangskode'}</Label><Input key={method+'-password'} id="password" name="password" type="password" autoComplete="current-password" inputMode={method==='opsfly'?'numeric':undefined} pattern={method==='opsfly'?'[0-9]{6}':undefined} minLength={method==='opsfly'?6:undefined} maxLength={method==='opsfly'?6:undefined} required disabled={pending}/></div>
      <Button className="w-full" disabled={pending}>{pending?'Logger ind…':'Log ind'}</Button>
      </form>
      <div className="mt-5 text-center">
        <Button type="button" variant="link" disabled={pending} onClick={()=>{setMethod(method==='opsfly'?'firebase':'opsfly');setError('');}}>{method==='opsfly'?'Log ind med en separat Orderfly-konto':'Log ind med Opsfly'}</Button>
      </div>
    </section>
  </main>;
}

export default function AdminLogin(){return <Suspense fallback={<main className="p-8">Indlæser login…</main>}><AdminLoginForm/></Suspense>;}
