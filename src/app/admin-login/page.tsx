'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function AdminLogin() {
  const [method,setMethod]=useState<'opsfly'|'firebase'>('opsfly');
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  return <main className="mx-auto max-w-md space-y-5 px-5 py-16">
    <h1 className="text-2xl font-bold">Log ind til Orderfly</h1>
    <p>{method==='opsfly'?'Brug din e-mail eller dit brugernavn og den samme PIN som i Opsfly.':'Brug din Orderfly-konto med e-mail og adgangskode.'}</p>
    <form className="space-y-4" onSubmit={async event=>{
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
        await clearFirebase?.();window.location.assign('/superadmin/sales/orders');
      } catch {setError('Kunne ikke logge ind. Prøv igen.');}
      finally {await clearFirebase?.().catch(()=>{});setPending(false);}
    }}>
      {error&&<p role="alert" className="text-destructive">{error}</p>}
      <div className="space-y-2"><Label htmlFor="identifier">{method==='opsfly'?'E-mail eller brugernavn':'E-mail'}</Label><Input key={method+'-identifier'} id="identifier" name="identifier" type={method==='opsfly'?'text':'email'} autoComplete="username" required maxLength={160} disabled={pending}/></div>
      <div className="space-y-2"><Label htmlFor="password">{method==='opsfly'?'PIN (6 cifre)':'Adgangskode'}</Label><Input key={method+'-password'} id="password" name="password" type="password" autoComplete="current-password" inputMode={method==='opsfly'?'numeric':undefined} pattern={method==='opsfly'?'[0-9]{6}':undefined} minLength={method==='opsfly'?6:undefined} maxLength={method==='opsfly'?6:undefined} required disabled={pending}/></div>
      <Button className="w-full" disabled={pending}>{pending?'Logger ind…':'Log ind'}</Button>
    </form>
    <Button type="button" variant="link" disabled={pending} onClick={()=>{setMethod(method==='opsfly'?'firebase':'opsfly');setError('');}}>{method==='opsfly'?'Log ind med en separat Orderfly-konto':'Log ind med Opsfly'}</Button>
  </main>;
}
