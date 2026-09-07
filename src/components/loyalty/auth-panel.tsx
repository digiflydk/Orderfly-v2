'use client';
import '@/lib/firebase';
import { closeFinancialAdminSession } from '@/app/loyalty/admin-session-actions';
import { getApp } from 'firebase/app';
import { getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendEmailVerification,sendPasswordResetEmail,signOut,type User } from 'firebase/auth';
import { useEffect,useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoyaltyAuth({onUser}:{onUser:(user:User|null)=>void}) {
  const [user,setUser]=useState<User|null>(null),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>onAuthStateChanged(getAuth(getApp()),u=>{setUser(u);onUser(u?.emailVerified?u:null);}),[onUser]);
  async function act(kind:'login'|'create'|'verify'|'refresh'|'logout'|'reset') {
    setBusy(true);setMessage('');
    try {
      const auth=getAuth(getApp());
      if(kind==='login')await signInWithEmailAndPassword(auth,email,password);
      if(kind==='create'){const result=await createUserWithEmailAndPassword(auth,email,password);await sendEmailVerification(result.user);setMessage('Bekræft din e-mail via linket, vi har sendt.');}
      if(kind==='verify'&&auth.currentUser){await sendEmailVerification(auth.currentUser);setMessage('Bekræftelsesmail sendt.');}
      if(kind==='refresh'&&auth.currentUser){await auth.currentUser.reload();await auth.currentUser.getIdToken(true);setUser(auth.currentUser);onUser(auth.currentUser.emailVerified?auth.currentUser:null);}
      if(kind==='logout'){await closeFinancialAdminSession();await signOut(auth);onUser(null);window.dispatchEvent(new Event('financial-admin-logout'));}
      if(kind==='reset'){await sendPasswordResetEmail(auth,email);setMessage('Hvis kontoen findes, modtager du et link til at nulstille adgangskoden.');}
      setPassword('');
    }catch{setMessage('Kunne ikke gennemføre. Kontrollér oplysningerne eller prøv igen senere.');}finally{setBusy(false);}
  }
  return <div className="space-y-3" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(!busy&&!user)void act('login');}}}>
    {user?<><p>Logget ind som {user.email}</p>{!user.emailVerified&&<><p>Bekræft din e-mail for at bruge loyalty.</p><Button type="button" disabled={busy} onClick={()=>act('verify')}>Send bekræftelsesmail</Button><Button type="button" disabled={busy} onClick={()=>act('refresh')}>Jeg har bekræftet</Button></>}<Button type="button" variant="outline" disabled={busy} onClick={()=>act('logout')}>Log ud</Button></>:<>
      <label className="block">E-mail<Input autoComplete="username" type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label className="block">Adgangskode<Input autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
      <div className="flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={()=>act('login')}>Log ind</Button><Button type="button" variant="outline" disabled={busy} onClick={()=>act('create')}>Opret kundekonto</Button><Button type="button" variant="ghost" disabled={busy} onClick={()=>act('reset')}>Glemt adgangskode</Button></div>
    </>}{busy&&<p role="status">Arbejder…</p>}{message&&<p role="status">{message}</p>}
  </div>;
}
